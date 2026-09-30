import { expect, test, type Browser, type Page } from "@playwright/test";
import { editorText, replaceSource, typeAtEnd, waitForSync } from "./helpers";

// Community problems: write one, publish it, find it, start a room from it,
// and check an answer against its test cases.

let seq = 0;

function unique(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

async function signUp(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const handle = unique("author").replace(/-/g, "");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.edu`);
  await page.getByLabel("Username").fill(handle);
  await page.getByLabel("Display name").fill("Ana the Author");
  await page.getByLabel("Password").fill("a good long password");
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("account-button")).toBeVisible();
  return page;
}

/** Fills in the authoring form for a working "add two numbers" problem. */
async function writeAddProblem(page: Page, title: string) {
  await page.goto("/problems/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("One-line summary").fill("Return the sum of two numbers.");
  await page.getByTestId("statement-input").fill("Add **a** and **b** and return the result.\n\n- No imports needed.");
  await page.getByTestId("starter-input").fill("def add(a, b):\n    return 0\n");
  await page.getByLabel("Function to call").fill("add");

  // One visible case and one hidden case.
  await page.getByTestId("test-args-0").fill("[2, 3]");
  await page.getByTestId("test-expected-0").fill("5");
  await page.getByTestId("test-row-0").getByRole("textbox").first().fill("adds two positives");

  // Deliberately not a case the `return 0` stub passes by accident.
  await page.getByTestId("add-test").click();
  await page.getByTestId("test-args-1").fill("[10, 5]");
  await page.getByTestId("test-expected-1").fill("15");
  await page.getByTestId("test-hidden-1").check();

  await page.getByTestId("save-problem").click();
  await expect(page).toHaveURL(/\/problems\/[a-z0-9-]+\/edit\?created=1$/);
}

function slugFrom(url: string): string {
  return url.match(/\/problems\/([a-z0-9-]+)\/edit/)?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// The home page
// ---------------------------------------------------------------------------

test("the home page leads with the default problems", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("section-official")).toBeVisible();
  await expect(page.getByTestId("section-official")).toContainText("Default problems");
  for (const slug of ["two-sum", "longest-substring-without-repeating-characters", "palindrome-number"]) {
    await expect(page.getByTestId(`problem-card-${slug}`)).toBeVisible();
  }
  // And the two ways to start without picking a problem.
  await expect(page.getByTestId("choose-blank")).toBeVisible();
  await expect(page.getByTestId("write-a-problem")).toBeVisible();
});

test("search finds a problem by words in its statement", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("search-input").fill("carrying the overflow");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/problems\?q=/);
  await expect(page.getByTestId("problem-card-add-two-numbers")).toBeVisible();
  await expect(page.getByTestId("problem-card-two-sum")).toHaveCount(0);
});

test("filters narrow the browse list and stay in the URL", async ({ page }) => {
  await page.goto("/problems");
  await page.getByTestId("filter-medium").click();
  await expect(page).toHaveURL(/difficulty=medium/);
  await expect(page.getByTestId("problem-card-longest-substring-without-repeating-characters")).toBeVisible();
  await expect(page.getByTestId("problem-card-two-sum")).toHaveCount(0);

  // The URL alone reproduces the view.
  await page.reload();
  await expect(page.getByTestId("problem-card-longest-substring-without-repeating-characters")).toBeVisible();
});

test("a problem page shows the statement, examples and what the tests check", async ({ page }) => {
  await page.goto("/problems/two-sum");
  await expect(page.getByTestId("problem-title")).toHaveText("Two Sum");
  await expect(page.locator(".prose-statement")).toContainText("Return those two positions as a list");
  await expect(page.getByTestId("test-summary")).toContainText("two_sum");
  // Hidden cases are counted but not spelled out.
  await expect(page.getByTestId("test-summary")).toContainText("hidden");
});

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

test("write a problem, publish it, and find it from the home page", async ({ browser }) => {
  const page = await signUp(browser);
  const title = `Add Two Numbers ${seq}`;
  await writeAddProblem(page, title);
  const slug = slugFrom(page.url());
  expect(slug).not.toBe("");

  // A draft is not public yet.
  await expect(page.getByText("Draft", { exact: false }).first()).toBeVisible();

  const anonymous = await browser.newContext();
  const stranger = await anonymous.newPage();
  await stranger.goto(`/problems/${slug}`);
  await expect(stranger.getByRole("heading", { name: /doesn’t exist|not found/i })).toBeVisible();

  // Publish it. Assert on the badge rather than on a banner: the "draft
  // created" banner is already on screen, so waiting for one would pass before
  // the request had even finished.
  await page.getByTestId("visibility-public").click();
  await expect(page.getByTestId("problem-visibility")).toHaveText("public");

  // Now a stranger can read it, and it turns up in search.
  await stranger.goto(`/problems/${slug}`);
  await expect(stranger.getByTestId("problem-title")).toHaveText(title);
  await expect(stranger.locator(".prose-statement")).toContainText("Add a and b");

  await stranger.goto(`/problems?q=${encodeURIComponent("sum of two numbers")}`);
  await expect(stranger.getByTestId(`problem-card-${slug}`)).toBeVisible();

  await anonymous.close();
  await page.context().close();
});

test("the authoring form rejects test arguments that are not a JSON list", async ({ browser }) => {
  const page = await signUp(browser);
  await page.goto("/problems/new");
  await page.getByLabel("Title").fill("Broken Cases");
  await page.getByTestId("test-args-0").fill("not json");
  await expect(page.getByTestId("test-row-0")).toContainText("Not valid JSON yet");

  await page.getByTestId("test-args-0").fill("5");
  await expect(page.getByTestId("test-row-0")).toContainText("square brackets");

  await page.getByTestId("test-args-0").fill("[5]");
  await expect(page.getByTestId("test-row-0")).not.toContainText("Not valid JSON");
  await page.context().close();
});

test("a problem statement cannot inject script into a reader's page", async ({ browser }) => {
  const page = await signUp(browser);
  await page.goto("/problems/new");
  await page.getByLabel("Title").fill(`Nasty Statement ${seq}`);
  await page
    .getByTestId("statement-input")
    .fill('<img src=x onerror="window.__owned = true">\n\n[click](javascript:window.__owned=true)\n\nOrdinary **text**.');
  await page.getByLabel("Function to call").fill("add");
  await page.getByTestId("test-args-0").fill("[1]");
  await page.getByTestId("test-expected-0").fill("1");
  await page.getByTestId("save-problem").click();
  await expect(page).toHaveURL(/\/edit\?created=1$/);
  const slug = slugFrom(page.url());

  await page.getByTestId("visibility-public").click();
  await expect(page.getByTestId("problem-visibility")).toHaveText("public");

  const context = await browser.newContext();
  const reader = await context.newPage();
  await reader.goto(`/problems/${slug}`);
  await expect(reader.locator(".prose-statement")).toContainText("Ordinary text");

  // Nothing executed. An <img> is allowed — statements legitimately contain
  // them — but it must arrive with no behaviour attached.
  expect(await reader.evaluate(() => (window as unknown as { __owned?: boolean }).__owned)).toBeUndefined();

  const handlers = await reader.locator(".prose-statement *").evaluateAll((nodes) =>
    nodes.flatMap((node) =>
      [...node.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith("on")),
    ),
  );
  expect(handlers).toEqual([]);

  const hrefs = await reader.locator(".prose-statement a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  expect(hrefs.some((href) => href.toLowerCase().startsWith("javascript:"))).toBe(false);

  await context.close();
  await page.context().close();
});

// ---------------------------------------------------------------------------
// Running the tests
// ---------------------------------------------------------------------------

test("a room checks the solution against the author's test cases", async ({ browser }) => {
  test.setTimeout(150_000);
  const author = await signUp(browser);
  await writeAddProblem(author, `Add For Testing ${seq}`);
  const slug = slugFrom(author.url());
  await author.getByTestId("visibility-public").click();
  await expect(author.getByTestId("problem-visibility")).toHaveText("public");

  // Someone else opens it and starts a room.
  const context = await browser.newContext();
  const ada = await context.newPage();
  await ada.goto(`/problems/${slug}`);
  await ada.getByTestId("start-room").click();
  await ada.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(ada);

  // The starter code came through.
  await expect.poll(() => editorText(ada)).toContain("def add(a, b):");

  // The stub fails both cases.
  await ada.getByTestId("test-button").click();
  await expect(ada.getByTestId("tests-results")).toBeVisible({ timeout: 120_000 });
  await expect(ada.getByTestId("test-result-0")).toHaveAttribute("data-passed", "false");
  await expect(ada.getByTestId("tests-badge")).toContainText("0/2");
  // A failure says what it wanted and what it got.
  await expect(ada.getByTestId("test-result-0")).toContainText("want 5");

  // Fix it, and everything passes.
  await replaceSource(ada, "def add(a, b):\n    return a + b");
  await expect.poll(() => editorText(ada)).toContain("return a + b");

  await ada.getByTestId("test-button").click();
  await expect(ada.getByTestId("tests-badge")).toContainText("2/2", { timeout: 60_000 });
  await expect(ada.getByTestId("test-result-1")).toHaveAttribute("data-passed", "true");

  await context.close();
  await author.context().close();
});

test("test results are shared with the other person in the room", async ({ browser }) => {
  test.setTimeout(150_000);
  const lin = await signUp(browser);
  await lin.goto("/problems/two-sum");
  await lin.getByTestId("start-room").click();
  await lin.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(lin);
  const url = lin.url();

  const context = await browser.newContext();
  const ada = await context.newPage();
  await ada.goto(url);
  await waitForSync(ada);

  await lin.getByTestId("test-button").click();
  await expect(lin.getByTestId("tests-badge")).toBeVisible({ timeout: 120_000 });

  // The other side lands on the same verdict without running anything.
  await expect(ada.getByTestId("tests-badge")).toBeVisible({ timeout: 30_000 });
  await expect(ada.getByTestId("tests-results")).toBeVisible();

  await context.close();
  await lin.context().close();
});

test("a hidden case reports its verdict without revealing its arguments", async ({ browser }) => {
  test.setTimeout(150_000);
  const author = await signUp(browser);
  await writeAddProblem(author, `Hidden Case ${seq}`);
  const slug = slugFrom(author.url());
  await author.getByTestId("visibility-public").click();
  await expect(author.getByTestId("problem-visibility")).toHaveText("public");

  const context = await browser.newContext();
  const ada = await context.newPage();
  await ada.goto(`/problems/${slug}`);
  // The problem page lists the visible case only.
  await expect(ada.getByTestId("test-summary")).toContainText("1 case is hidden");

  await ada.getByTestId("start-room").click();
  await ada.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(ada);
  await ada.getByTestId("test-button").click();
  await expect(ada.getByTestId("tests-results")).toBeVisible({ timeout: 120_000 });

  const hidden = ada.getByTestId("test-result-1");
  await expect(hidden).toContainText("Hidden");
  await expect(hidden).toHaveAttribute("data-passed", "false");
  // The verdict is shown; the arguments are not.
  await expect(hidden).not.toContainText("10, 5");

  await context.close();
  await author.context().close();
});

// ---------------------------------------------------------------------------
// Rooms outlive their problem
// ---------------------------------------------------------------------------

test("editing or deleting a problem does not change a room already started from it", async ({ browser }) => {
  const author = await signUp(browser);
  await writeAddProblem(author, `Doomed Problem ${seq}`);
  const slug = slugFrom(author.url());
  await author.getByTestId("visibility-public").click();
  await expect(author.getByTestId("problem-visibility")).toHaveText("public");

  const context = await browser.newContext();
  const ada = await context.newPage();
  await ada.goto(`/problems/${slug}`);
  await ada.getByTestId("start-room").click();
  await ada.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(ada);
  const roomUrl = ada.url();
  await expect(ada.getByTestId("problem-panel")).toContainText("Add a and b");

  // The author rewrites the statement.
  await author.goto(`/problems/${slug}/edit`);
  await author.getByTestId("statement-input").fill("Completely different now.");
  await author.getByTestId("save-problem").click();
  await expect(author.getByTestId("form-success")).toBeVisible();

  // The room still shows what it was started with.
  await ada.reload();
  await waitForSync(ada);
  await expect(ada.getByTestId("problem-panel")).toContainText("Add a and b");
  await expect(ada.getByTestId("problem-panel")).not.toContainText("Completely different");

  // And deleting the problem does not break the room.
  author.once("dialog", (dialog) => void dialog.accept());
  await author.getByTestId("delete-problem").click();
  await expect(author).toHaveURL(/\/problems/);

  await ada.goto(roomUrl);
  await waitForSync(ada);
  await expect(ada.getByTestId("problem-panel")).toContainText("Add a and b");
  await typeAtEnd(ada, "\n# still editable");
  await expect.poll(() => editorText(ada)).toContain("still editable");

  await context.close();
  await author.context().close();
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

test("collect problems into a list", async ({ browser }) => {
  const page = await signUp(browser);

  await page.goto("/problems/two-sum");
  await page.getByTestId("add-to-list").click();
  await expect(page.getByTestId("list-menu")).toBeVisible();
  await page.getByTestId("new-list").click();
  await page.getByTestId("new-list-title").fill("Week 1");
  await page.getByTestId("create-list-confirm").click();
  // Wait for the count to come back from the server before navigating away:
  // a click is not a promise that the write finished.
  await expect(page.getByTestId("list-count-week-1")).toHaveText("1");

  await page.goto("/lists");
  await expect(page.getByTestId("list-week-1")).toContainText("Week 1");
  await expect(page.getByTestId("list-week-1")).toContainText("1 problem");

  // A second problem joins it through the tick box.
  await page.goto("/problems/longest-substring-without-repeating-characters");
  await page.getByTestId("add-to-list").click();
  await page.getByTestId("list-option-week-1").click();
  await expect(page.getByTestId("list-count-week-1")).toHaveText("2");

  await page.goto("/lists");
  await page.getByTestId("list-week-1").click();
  await expect(page.getByTestId("problem-card-two-sum")).toBeVisible();
  await expect(page.getByTestId("problem-card-longest-substring-without-repeating-characters")).toBeVisible();

  // Removing one takes it back out.
  await page.getByTestId("remove-longest-substring-without-repeating-characters").click();
  await expect(page.getByTestId("problem-card-longest-substring-without-repeating-characters")).toHaveCount(0);
  await expect(page.getByTestId("problem-card-two-sum")).toBeVisible();

  await page.context().close();
});

test("a private list is not readable by anyone else", async ({ browser }) => {
  const owner = await signUp(browser);
  await owner.goto("/lists");
  await owner.getByLabel("New list").fill("Secret plans");
  await owner.getByTestId("create-list").click();
  await owner.getByTestId("list-secret-plans").click();
  await owner.waitForURL(/\/lists\/[0-9a-f-]{36}$/);
  const listUrl = owner.url();

  const context = await browser.newContext();
  const stranger = await context.newPage();
  await stranger.goto(listUrl);
  await expect(stranger.getByRole("heading", { name: /doesn’t exist|not found/i })).toBeVisible();

  await context.close();
  await owner.context().close();
});

test("a profile shows what someone wrote", async ({ browser }) => {
  const page = await signUp(browser);
  await writeAddProblem(page, `Profile Problem ${seq}`);
  const slug = slugFrom(page.url());
  await page.getByTestId("visibility-public").click();
  await expect(page.getByTestId("problem-visibility")).toHaveText("public");

  await page.getByTestId("account-button").click();
  const handle = (await page.getByTestId("account-menu").innerText()).match(/@(\w+)/)?.[1] ?? "";
  expect(handle).not.toBe("");

  await page.goto(`/u/${handle}`);
  await expect(page.getByRole("heading", { name: "Ana the Author" })).toBeVisible();
  await expect(page.getByTestId(`problem-card-${slug}`)).toBeVisible();

  await page.context().close();
});

test("the default problems are attributed to the duckduckcode account", async ({ page }) => {
  await page.goto("/u/duckduckcode");
  await expect(page.getByRole("heading", { name: "duckduckcode" }).first()).toBeVisible();
  await expect(page.getByTestId("problem-card-two-sum")).toBeVisible();
});

test("only the author can edit a problem", async ({ browser }) => {
  const author = await signUp(browser);
  await writeAddProblem(author, `Not Yours ${seq}`);
  const slug = slugFrom(author.url());
  await author.getByTestId("visibility-public").click();
  await expect(author.getByTestId("problem-visibility")).toHaveText("public");

  const other = await signUp(browser);
  await other.goto(`/problems/${slug}`);
  // No edit button for someone else's problem...
  await expect(other.getByTestId("edit-problem")).toHaveCount(0);
  // ...and the URL is not a way around it.
  await other.goto(`/problems/${slug}/edit`);
  await expect(other.getByRole("heading", { name: /doesn’t exist|not found/i })).toBeVisible();

  await other.context().close();
  await author.context().close();
});
