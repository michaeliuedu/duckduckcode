import { expect, test, type Page } from "@playwright/test";
import { createPracticeRoom, openSession } from "./helpers";

// The workspace layout: dragging, collapsing, keyboard resizing, persistence,
// and what happens when the window is too narrow for three panes.

const PROBLEM_SPLIT = '[data-testid="split-problem-divider"]';
const CONSOLE_SPLIT = '[data-testid="split-console-divider"]';

function paneWidth(page: Page, testId: string): Promise<number> {
  return page.locator(`[data-testid="${testId}"]`).evaluate((el) => el.getBoundingClientRect().width);
}

function paneHeight(page: Page, testId: string): Promise<number> {
  return page.locator(`[data-testid="${testId}"]`).evaluate((el) => el.getBoundingClientRect().height);
}

/** Drags a divider by a pixel offset using real pointer events. */
async function dragDivider(page: Page, selector: string, dx: number, dy: number) {
  const divider = page.locator(selector);
  const box = await divider.boundingBox();
  if (!box) throw new Error(`no divider at ${selector}`);
  const fromX = box.x + box.width / 2;
  const fromY = box.y + box.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Two moves: some pointer-capture paths ignore a single jump.
  await page.mouse.move(fromX + dx / 2, fromY + dy / 2);
  await page.mouse.move(fromX + dx, fromY + dy);
  await page.mouse.up();
}

test.describe("resizable workspace", () => {
  test("dragging the problem divider resizes the panes and survives a reload", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    const before = await paneWidth(page, "problem-panel");
    await dragDivider(page, PROBLEM_SPLIT, -160, 0);

    const after = await paneWidth(page, "problem-panel");
    expect(after).toBeLessThan(before - 100);

    // The size is remembered for this browser, not just this page view.
    await page.reload();
    await expect(page.getByTestId("problem-panel")).toBeVisible();
    await expect.poll(() => paneWidth(page, "problem-panel")).toBeCloseTo(after, -1);

    await page.context().close();
  });

  test("dragging the console divider resizes the editor and the console", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "longest-substring-without-repeating-characters");
    const page = await openSession(browser, url, "Ada");

    const editorBefore = await paneHeight(page, "editor-panel");
    const consoleBefore = await paneHeight(page, "console-panel");

    await dragDivider(page, CONSOLE_SPLIT, 0, -120);

    expect(await paneHeight(page, "editor-panel")).toBeLessThan(editorBefore - 80);
    expect(await paneHeight(page, "console-panel")).toBeGreaterThan(consoleBefore + 80);

    await page.context().close();
  });

  test("a divider refuses to squeeze a pane below its minimum", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    // Drag far past the left edge of the window.
    await dragDivider(page, PROBLEM_SPLIT, -4000, 0);
    expect(await paneWidth(page, "problem-panel")).toBeGreaterThanOrEqual(230);

    await dragDivider(page, PROBLEM_SPLIT, 4000, 0);
    expect(await paneWidth(page, "editor-panel")).toBeGreaterThanOrEqual(350);

    await page.context().close();
  });

  test("a divider is operable from the keyboard and reports its position", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    const divider = page.locator(PROBLEM_SPLIT);
    await expect(divider).toHaveAttribute("role", "separator");
    await expect(divider).toHaveAttribute("aria-orientation", "vertical");

    await divider.focus();
    const before = await paneWidth(page, "problem-panel");

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const afterArrows = await paneWidth(page, "problem-panel");
    expect(afterArrows).toBeLessThan(before);

    // Shift moves further in one press.
    await page.keyboard.press("Shift+ArrowRight");
    expect(await paneWidth(page, "problem-panel")).toBeGreaterThan(afterArrows);

    // Home goes to the smallest allowed size, End to the largest.
    await page.keyboard.press("Home");
    const atMin = await paneWidth(page, "problem-panel");
    await page.keyboard.press("End");
    expect(await paneWidth(page, "problem-panel")).toBeGreaterThan(atMin);

    // Enter restores the default.
    await page.keyboard.press("Enter");
    expect(await paneWidth(page, "problem-panel")).toBeCloseTo(before, -1);

    await page.context().close();
  });

  test("double-clicking a divider resets just that divider", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    const before = await paneWidth(page, "problem-panel");
    await dragDivider(page, PROBLEM_SPLIT, -140, 0);
    expect(await paneWidth(page, "problem-panel")).toBeLessThan(before - 80);

    await page.locator(PROBLEM_SPLIT).dblclick();
    expect(await paneWidth(page, "problem-panel")).toBeCloseTo(before, -1);

    await page.context().close();
  });

  test("panes can be collapsed and brought back, and the state is remembered", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    await expect(page.getByTestId("problem-panel")).toBeVisible();
    await page.getByTestId("toggle-problem").click();
    await expect(page.getByTestId("problem-panel")).toHaveCount(0);

    await page.getByTestId("toggle-console").click();
    await expect(page.getByTestId("console-panel")).toHaveCount(0);
    // The editor now has the whole workspace.
    await expect(page.getByTestId("editor-panel")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("editor-panel")).toBeVisible();
    await expect(page.getByTestId("problem-panel")).toHaveCount(0);
    await expect(page.getByTestId("console-panel")).toHaveCount(0);

    await page.getByTestId("toggle-problem").click();
    await page.getByTestId("toggle-console").click();
    await expect(page.getByTestId("problem-panel")).toBeVisible();
    await expect(page.getByTestId("console-panel")).toBeVisible();

    await page.context().close();
  });

  test("Reset layout restores every pane", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    const before = await paneWidth(page, "problem-panel");
    await dragDivider(page, PROBLEM_SPLIT, -150, 0);
    await page.getByTestId("toggle-console").click();
    await expect(page.getByTestId("console-panel")).toHaveCount(0);

    await page.getByTestId("reset-layout").click();

    await expect(page.getByTestId("console-panel")).toBeVisible();
    await expect.poll(() => paneWidth(page, "problem-panel")).toBeCloseTo(before, -1);

    await page.context().close();
  });

  test("Ctrl+B and Ctrl+J toggle the problem and console panes", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const page = await openSession(browser, url, "Ada");

    await page.keyboard.press("Control+b");
    await expect(page.getByTestId("problem-panel")).toHaveCount(0);
    await page.keyboard.press("Control+b");
    await expect(page.getByTestId("problem-panel")).toBeVisible();

    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("console-panel")).toHaveCount(0);
    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("console-panel")).toBeVisible();

    await page.context().close();
  });
});

test.describe("narrow screens", () => {
  test("the three panes become tabs, with no dividers to drag", async ({ browser }) => {
    const url = await createPracticeRoom(browser, "two-sum");
    const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('[data-testid="connection-status"]')).toHaveAttribute("data-synced", "true");

    await expect(page.locator(PROBLEM_SPLIT)).toHaveCount(0);
    await expect(page.getByTestId("narrow-tab-code")).toBeVisible();

    // The code pane is the one that opens.
    await expect(page.getByTestId("editor-panel")).toBeVisible();

    await page.getByTestId("narrow-tab-problem").click();
    await expect(page.getByTestId("problem-panel")).toBeVisible();

    await page.getByTestId("narrow-tab-console").click();
    await expect(page.getByTestId("console-panel")).toBeVisible();

    // Tabs are arrow-key navigable, per the ARIA tabs pattern.
    await page.getByTestId("narrow-tab-console").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("editor-panel")).toBeVisible();

    await context.close();
  });
});
