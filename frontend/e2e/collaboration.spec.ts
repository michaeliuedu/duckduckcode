import { expect, test } from "@playwright/test";
import {
  createBlankRoom,
  createPracticeRoom,
  EDITOR,
  editorText,
  openSession,
  ROOM_URL,
  STATUS,
  typeAtEnd,
  typeAtStart,
  waitForSync,
} from "./helpers";

// Two isolated browser contexts (separate cookies and localStorage, i.e. two
// genuinely separate people) share one room through the Go backend.

test("practice room: link is hard to guess and shows the problem with starter code", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "two-sum");
  expect(url).toMatch(ROOM_URL);

  const page = await openSession(browser, url, "Ada");
  await expect(page.getByTestId("room-title")).toHaveText("Two Sum");
  await expect(page.getByTestId("problem-panel")).toContainText("Return those two positions as a list");
  await expect(page.getByTestId("share-link")).toHaveValue(url);
  expect(await editorText(page)).toContain("def two_sum(");
});

test("two sessions edit simultaneously and see each other's cursors", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "longest-substring-without-repeating-characters");
  const ada = await openSession(browser, url, "Ada");
  const lin = await openSession(browser, url, "Lin");

  // Each side sees both participants in the header.
  for (const page of [ada, lin]) {
    await expect(page.locator('[data-testid="peer"][data-peer-name="Ada"]')).toBeVisible();
    await expect(page.locator('[data-testid="peer"][data-peer-name="Lin"]')).toBeVisible();
  }

  // Simultaneous edits at opposite ends of the document.
  await Promise.all([
    typeAtEnd(ada, "\n# ada: I think BFS works here"),
    typeAtStart(lin, "# lin: remember to mark cells as seen\n"),
  ]);

  // Both documents converge to the same text containing both edits.
  await expect.poll(() => editorText(ada)).toContain("# ada: I think BFS works here");
  await expect.poll(() => editorText(ada)).toContain("# lin: remember to mark cells as seen");
  await expect.poll(() => editorText(lin)).toContain("# ada: I think BFS works here");
  await expect.poll(async () => (await editorText(lin)) === (await editorText(ada))).toBe(true);

  // Remote cursors: each editor renders the other participant's caret, labelled
  // with their name (see src/editor/remoteCursors.ts).
  await expect(ada.locator(".cm-ySelectionCaret")).toHaveCount(1);
  await expect(ada.locator(".cm-ySelectionInfo")).toHaveText("Lin");
  await expect(lin.locator(".cm-ySelectionCaret")).toHaveCount(1);
  await expect(lin.locator(".cm-ySelectionInfo")).toHaveText("Ada");
});

test("disconnect, edit offline on both sides, reconnect, then refresh restores everything", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "palindrome-number");
  const ada = await openSession(browser, url, "Ada");
  const lin = await openSession(browser, url, "Lin");

  // Ada drops the connection.
  await ada.getByTestId("offline-toggle").click();
  await expect(ada.locator(STATUS)).toHaveAttribute("data-status", "offline");
  // Lin is told that Ada left.
  await expect(lin.locator('[data-testid="peer"][data-peer-name="Ada"]')).toHaveCount(0);

  // Both keep editing while apart.
  await typeAtEnd(ada, "\n# offline edit by ada");
  await typeAtStart(lin, "# lin edited while ada was away\n");
  await expect.poll(() => editorText(lin)).not.toContain("# offline edit by ada");

  // Ada reconnects; both sides converge.
  await ada.getByTestId("offline-toggle").click();
  await waitForSync(ada);
  await expect.poll(() => editorText(lin)).toContain("# offline edit by ada");
  await expect.poll(() => editorText(ada)).toContain("# lin edited while ada was away");
  await expect.poll(async () => (await editorText(lin)) === (await editorText(ada))).toBe(true);
  await expect(lin.locator('[data-testid="peer"][data-peer-name="Ada"]')).toBeVisible();

  // A hard refresh restores the latest document, the problem and the code.
  const before = await editorText(ada);
  await ada.reload();
  await waitForSync(ada);
  await expect(ada.getByTestId("room-title")).toHaveText("Palindrome Number");
  await expect(ada.getByTestId("problem-panel")).toContainText("reads the same forwards and backwards");
  await expect.poll(() => editorText(ada)).toBe(before);
});

test("blank workspace persists edits across a reload by a new session", async ({ browser }) => {
  const { page, url } = await createBlankRoom(browser);
  await expect(page.getByTestId("room-title")).toHaveText("Blank workspace");
  await expect(page.getByTestId("problem-panel")).toHaveCount(0);
  expect(await editorText(page)).toBe("");

  await typeAtEnd(page, "print('hello from a blank room')");

  // A brand-new session receives the persisted text from the server.
  const other = await openSession(browser, url, "Later");
  await expect.poll(() => editorText(other)).toBe("print('hello from a blank room')");

  // Even after the author leaves, a reload restores it from PostgreSQL.
  await page.context().close();
  await other.reload();
  await waitForSync(other);
  await expect.poll(() => editorText(other)).toBe("print('hello from a blank room')");
});

test("unknown room shows a not-found page", async ({ page }) => {
  await page.goto("/rooms/this-room-does-not-exist");
  await expect(page.getByRole("heading", { name: /doesn’t exist|not found/i })).toBeVisible();
  // And a way out that does not involve editing the URL.
  await page.getByRole("link", { name: /Back to problems/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an unknown URL shows the not-found page rather than a blank screen", async ({ page }) => {
  await page.goto("/nothing/here");
  await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
});

test("Run executes Python in the browser and shares the output", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page, url } = await createBlankRoom(browser);

  await typeAtEnd(page, "print('hello-run')");
  await page.keyboard.press("Enter");
  await page.keyboard.type("print('line-two')");
  await page.getByTestId("run-button").click();

  await expect(page.getByTestId("output-text")).toContainText("hello-run", { timeout: 90_000 });
  const printed = await page.getByTestId("output-text").evaluate((el) => el.textContent ?? "");
  expect(printed).toMatch(/hello-run\r?\nline-two/);

  // The other side sees the same result without running anything.
  const other = await openSession(browser, url, "Lin");
  await expect(other.getByTestId("output-text")).toContainText("hello-run");
  await page.context().close();
});

test("a run that never ends can be stopped, keeping the output it produced", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await createBlankRoom(browser);

  await typeAtEnd(page, "print('before the loop')");
  await page.keyboard.press("Enter");
  await page.keyboard.type("while True:");
  await page.keyboard.press("Enter");
  await page.keyboard.type("pass");

  await page.getByTestId("run-button").click();
  // Run becomes Stop while this browser is executing.
  const stop = page.getByTestId("stop-button");
  await expect(stop).toBeVisible({ timeout: 90_000 });

  // The page is still responsive — that is the point of the worker.
  await expect(page.getByTestId("output-text")).toContainText("before the loop");
  await stop.click();

  await expect(page.getByTestId("run-button")).toBeVisible();
  await expect(page.getByTestId("output-text")).toContainText("Stopped");
  await expect(page.getByTestId("output-text")).toContainText("before the loop");
  await page.context().close();
});

test("editor auto-closes brackets and offers completions", async ({ browser }) => {
  const { page } = await createBlankRoom(browser);
  await page.locator(EDITOR).click();
  await page.keyboard.type("print(");
  expect(await editorText(page)).toContain("print()");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.type("len");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("len");
  await page.context().close();
});

test("Visualize steps through Python and shares the trace", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page, url } = await createBlankRoom(browser);

  await typeAtEnd(page, "nums = [1, 2, 3]");
  await page.keyboard.press("Enter");
  await page.keyboard.type("print(sum(nums))");
  await expect.poll(() => editorText(page)).toContain("print(sum(nums))");

  await page.getByTestId("visualize-button").click();
  await expect(page.getByTestId("visualize-panel")).toBeVisible();
  await expect(page.getByTestId("visualize-step")).toContainText(/Step \d+ \//, { timeout: 90_000 });

  const next = page.getByTestId("visualize-next");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByTestId("visualize-step")).toContainText("Step 2 /");
  await expect(page.locator("[data-testid='visualize-var'][data-var-name='nums']")).toBeVisible();

  // The step pointer is shared: the other side lands on the same step.
  const other = await openSession(browser, url, "Lin");
  await other.getByTestId("visualize-tab").click();
  await expect(other.getByTestId("visualize-step")).toContainText("Step 2 /");
  await expect(other.locator("[data-testid='visualize-var'][data-var-name='nums']")).toBeVisible();

  // Stepping on one side moves the other.
  await other.getByTestId("visualize-prev").click();
  await expect(page.getByTestId("visualize-step")).toContainText("Step 1 /");
  await page.context().close();
});

test("the visualiser draws a list as indexed cells, with the cursors that point into it", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await createBlankRoom(browser);

  // Single-line statements only: the editor auto-indents, so a typed block
  // would not come out as written.
  await typeAtEnd(page, "xs = [4, 5, 6]");
  await page.keyboard.press("Enter");
  await page.keyboard.type("i = 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("xs[2] = 9");
  await page.keyboard.press("Enter");
  await page.keyboard.type("print(xs)");
  await expect.poll(() => editorText(page)).toContain("print(xs)");

  await page.getByTestId("visualize-button").click();
  await expect(page.getByTestId("visualize-step")).toContainText(/Step \d+ \//, { timeout: 90_000 });
  await page.getByTestId("visualize-last").click();

  const xs = page.locator("[data-testid='visualize-var'][data-var-name='xs']");
  await expect(xs).toBeVisible();

  // Every element is its own cell, numbered by position.
  const cells = xs.locator("[data-cell-index]");
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(2)).toContainText("9");

  // `i` is an index into xs, so it is drawn under the cell it addresses.
  await expect(xs.locator("[data-pointer='i']")).toBeVisible();
  await expect(cells.nth(1).locator("[data-pointer='i']")).toBeVisible();

  // The assignment on the previous line wrote to exactly one cell.
  await expect(xs.locator("[data-changed='true']")).toHaveCount(1);
  await expect(cells.nth(2).locator("[data-changed='true']")).toBeVisible();

  await page.context().close();
});

test("the visualiser draws a dict of neighbours as a graph", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await createBlankRoom(browser);

  await typeAtEnd(page, "graph = {0: [1], 1: [2], 2: [0]}");
  await page.keyboard.press("Enter");
  await page.keyboard.type("print(len(graph))");
  await expect.poll(() => editorText(page)).toContain("print(len(graph))");

  await page.getByTestId("visualize-button").click();
  await expect(page.getByTestId("visualize-step")).toContainText(/Step \d+ \//, { timeout: 90_000 });
  await page.getByTestId("visualize-last").click();

  const drawn = page.locator("[data-testid='visualize-var'][data-var-name='graph'] [data-testid='value-graph']");
  await expect(drawn).toBeVisible();
  await expect(drawn).toContainText("3 nodes · 3 edges");
  // One circle per node, so the picture matches the data.
  await expect(drawn.locator("circle")).toHaveCount(3);

  await page.context().close();
});
