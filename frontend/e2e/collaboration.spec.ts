import { test, expect, type Browser, type Page } from "@playwright/test";

// Two isolated browser contexts (separate cookies/localStorage, i.e. two
// "sessions") share one room through the Go backend.

const STATUS = '[data-testid="connection-status"]';
const EDITOR = '[data-testid="editor"]';

async function openSession(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.locator(STATUS)).toHaveAttribute("data-synced", "true");
  const nameInput = page.getByTestId("name-input");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.locator(`[data-testid="peer"][data-peer-name="${name}"]`)).toBeVisible();
  return page;
}

/** Document text as rendered, excluding remote-caret widgets (which differ per side). */
function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".cm-content .cm-line"));
    return lines
      .map((l) => {
        const clone = l.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".cm-ySelectionCaret").forEach((n) => n.remove());
        return clone.textContent ?? "";
      })
      .join("\n");
  });
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

async function typeAtStart(page: Page, text: string) {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(text);
}

async function createPracticeRoom(browser: Browser, problemId: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Practice problem/ }).click();
  await page.getByTestId(`problem-${problemId}`).click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  const url = page.url();
  await context.close();
  return url;
}

test("practice room: link is hard to guess and shows the problem with starter code", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "office-hours-queue");
  expect(url).toMatch(/\/rooms\/[A-Za-z0-9_-]{22}$/);

  const page = await openSession(browser, url, "Student");
  await expect(page.getByTestId("room-title")).toHaveText("Office Hours Queue");
  await expect(page.getByTestId("problem-panel")).toContainText("A TA runs office hours alone");
  await expect(page.getByTestId("share-link")).toHaveValue(url);
  expect(await editorText(page)).toContain("def office_hours_queue(");
});

test("two sessions edit simultaneously and see each other's cursors", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "duck-pond-census");
  const student = await openSession(browser, url, "Student");
  const ta = await openSession(browser, url, "TA");

  // Each side sees both participants in the header.
  for (const page of [student, ta]) {
    await expect(page.locator('[data-testid="peer"][data-peer-name="Student"]')).toBeVisible();
    await expect(page.locator('[data-testid="peer"][data-peer-name="TA"]')).toBeVisible();
  }

  // Simultaneous edits at opposite ends of the document.
  await Promise.all([
    typeAtEnd(student, "\n# student: I think BFS works here"),
    typeAtStart(ta, "# TA: remember to mark cells as seen\n"),
  ]);

  // Both documents converge to the same text containing both edits.
  await expect.poll(() => editorText(student)).toContain("# student: I think BFS works here");
  await expect.poll(() => editorText(student)).toContain("# TA: remember to mark cells as seen");
  await expect.poll(() => editorText(ta)).toContain("# student: I think BFS works here");
  await expect.poll(async () => (await editorText(ta)) === (await editorText(student))).toBe(true);

  // Remote cursors: each editor renders the other participant's caret with
  // their name (y-codemirror.next widgets).
  await expect(student.locator(".cm-ySelectionCaret")).toHaveCount(1);
  await expect(student.locator(".cm-ySelectionInfo")).toHaveText("TA");
  await expect(ta.locator(".cm-ySelectionCaret")).toHaveCount(1);
  await expect(ta.locator(".cm-ySelectionInfo")).toHaveText("Student");
});

test("disconnect, edit offline on both sides, reconnect, then refresh restores everything", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "commit-message-linter");
  const student = await openSession(browser, url, "Student");
  const ta = await openSession(browser, url, "TA");

  // Student drops the connection.
  await student.getByTestId("offline-toggle").click();
  await expect(student.locator(STATUS)).toHaveAttribute("data-status", "offline");
  // The TA is told the student left.
  await expect(ta.locator('[data-testid="peer"][data-peer-name="Student"]')).toHaveCount(0);

  // Both keep editing while apart.
  await typeAtEnd(student, "\n# offline edit by student");
  await typeAtStart(ta, "# TA edited while student was away\n");
  await expect.poll(() => editorText(ta)).not.toContain("# offline edit by student");

  // Student reconnects; both sides converge.
  await student.getByTestId("offline-toggle").click();
  await expect(student.locator(STATUS)).toHaveAttribute("data-synced", "true");
  await expect.poll(() => editorText(ta)).toContain("# offline edit by student");
  await expect.poll(() => editorText(student)).toContain("# TA edited while student was away");
  await expect.poll(async () => (await editorText(ta)) === (await editorText(student))).toBe(true);
  await expect(ta.locator('[data-testid="peer"][data-peer-name="Student"]')).toBeVisible();

  // A hard refresh restores the latest document, the problem and the code.
  const before = await editorText(student);
  await student.reload();
  await expect(student.locator(STATUS)).toHaveAttribute("data-synced", "true");
  await expect(student.getByTestId("room-title")).toHaveText("Commit Message Linter");
  await expect(student.getByTestId("problem-panel")).toContainText("Rule 1");
  await expect.poll(() => editorText(student)).toBe(before);
});

test("blank workspace persists edits across a reload by a new session", async ({ browser }) => {
  const creator = await browser.newContext();
  const page = await creator.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Blank workspace/ }).click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  const url = page.url();
  await expect(page.locator(STATUS)).toHaveAttribute("data-synced", "true");
  await expect(page.getByTestId("room-title")).toHaveText("Blank workspace");
  await expect(page.getByTestId("problem-panel")).toHaveCount(0);
  expect(await editorText(page)).toBe("");

  await typeAtEnd(page, "print('hello from a blank room')");

  // A brand-new session receives the persisted text from the server.
  const other = await openSession(browser, url, "Later");
  await expect.poll(() => editorText(other)).toBe("print('hello from a blank room')");

  // Even after the author leaves, a reload restores it from PostgreSQL.
  await creator.close();
  await other.reload();
  await expect(other.locator(STATUS)).toHaveAttribute("data-synced", "true");
  await expect.poll(() => editorText(other)).toBe("print('hello from a blank room')");
});

test("unknown room shows a not-found page", async ({ page }) => {
  await page.goto("/rooms/this-room-does-not-exist");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
});
