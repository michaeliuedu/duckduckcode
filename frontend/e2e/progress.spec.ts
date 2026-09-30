import { expect, test, type Browser, type Page } from "@playwright/test";
import { editorText, replaceSource, waitForSync } from "./helpers";

// Progress: the grid on the home page and the profile, and the attempt that
// fills it in.

let seq = 0;

async function signUp(browser: Browser): Promise<{ page: Page; handle: string }> {
  seq += 1;
  const handle = `prog${Date.now().toString(36)}${seq}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.edu`);
  await page.getByLabel("Username").fill(handle);
  await page.getByLabel("Display name").fill("Practising Person");
  await page.getByLabel("Password").fill("a good long password");
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("account-button")).toBeVisible();
  return { page, handle };
}

test("the home page shows an empty grid before anyone has practised", async ({ browser }) => {
  const { page } = await signUp(browser);
  await expect(page.getByTestId("hero-progress")).toBeVisible();
  await expect(page.getByTestId("progress-grid")).toBeVisible();
  await expect(page.getByTestId("progress-grid")).toContainText("this fills in");
  await expect(page.getByTestId("progress-stats")).toContainText("Solved");
  await expect(page.getByTestId("progress-square-active")).toHaveCount(0);
  await page.context().close();
});

test("an anonymous visitor gets the introduction, not a grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-intro")).toBeVisible();
  await expect(page.getByTestId("progress-grid")).toHaveCount(0);
});

test("solving a problem fills in the grid and ticks the row", async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, handle } = await signUp(browser);

  await page.goto("/problems/two-sum");
  await page.getByTestId("start-room").click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(page);

  // A wrong answer still counts as practice, but not as a solve.
  await replaceSource(page, "def two_sum(nums, target):\n    return []");
  await expect.poll(() => editorText(page)).toContain("return []");
  await page.getByTestId("test-button").click();
  await expect(page.getByTestId("tests-badge")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("tests-badge")).not.toContainText("6/6");

  await page.goto("/");
  await expect(page.getByTestId("progress-square-active")).toHaveCount(1);
  await expect(page.getByTestId("progress-stats")).toContainText("1");

  // Now solve it properly.
  await page.goBack();
  await waitForSync(page);
  await replaceSource(
    page,
    [
      "def two_sum(nums, target):",
      "    seen = {}",
      "    for i, n in enumerate(nums):",
      "        if target - n in seen:",
      "            return [seen[target - n], i]",
      "        seen[n] = i",
      "    return []",
    ].join("\n"),
  );
  await expect.poll(() => editorText(page)).toContain("seen[n] = i");
  await page.getByTestId("test-button").click();
  await expect(page.getByTestId("tests-badge")).toContainText("6/6", { timeout: 60_000 });

  // The home page records the solve and ticks the row.
  await page.goto("/");
  await expect(page.getByTestId("progress-stats")).toContainText("Solved");
  const stats = await page.getByTestId("progress-stats").innerText();
  expect(stats).toMatch(/1[\s\S]*Solved/);
  await expect(
    page.getByTestId("problem-card-two-sum").locator('[title="You solved this"]'),
  ).toBeVisible();

  // And so does the profile, which anyone can see.
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/u/${handle}`);
  await expect(visitor.getByTestId("profile-header")).toContainText("Practising Person");
  await expect(visitor.getByTestId("progress-square-active")).toHaveCount(1);

  await context.close();
  await page.context().close();
});

test("an anonymous room run records nothing and still works", async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/problems/longest-substring-without-repeating-characters");
  await page.getByTestId("start-room").click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(page);

  await page.getByTestId("test-button").click();
  await expect(page.getByTestId("tests-results")).toBeVisible({ timeout: 120_000 });
  // No account, so nothing to record — and no error either.
  await expect(page.getByTestId("sign-in-link")).toBeVisible();

  await context.close();
});

test("the profile lists problems and lists", async ({ browser }) => {
  const { page, handle } = await signUp(browser);

  await page.goto("/lists");
  await page.getByLabel("New list").fill("Revision");
  await page.getByTestId("create-list").click();
  await expect(page.getByTestId("list-revision")).toBeVisible();

  await page.goto(`/u/${handle}`);
  await expect(page.getByTestId("profile-problems")).toContainText("not written one yet");
  await expect(page.getByTestId("profile-lists")).toContainText("Revision");

  await page.context().close();
});
