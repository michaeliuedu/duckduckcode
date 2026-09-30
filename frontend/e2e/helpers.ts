import { expect, type Browser, type Page } from "@playwright/test";

/** Selectors shared across the specs. */
export const STATUS = '[data-testid="connection-status"]';
export const EDITOR = '[data-testid="editor"]';

export const ROOM_URL = /\/rooms\/[A-Za-z0-9_-]{22}$/;

/** Waits until this page has caught up with the server. */
export async function waitForSync(page: Page): Promise<void> {
  await expect(page.locator(STATUS)).toHaveAttribute("data-synced", "true");
}

/**
 * Opens a room in its own browser context — separate cookies and localStorage,
 * i.e. a genuinely separate participant — and gives them a known name.
 */
export async function openSession(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await waitForSync(page);
  const nameInput = page.getByTestId("name-input");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.locator(`[data-testid="peer"][data-peer-name="${name}"]`)).toBeVisible();
  return page;
}

/**
 * The document as rendered, minus the widgets that are not document content:
 * remote carets (which differ per side) and the empty-editor placeholder.
 */
export function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".cm-content .cm-line"));
    return lines
      .map((line) => {
        const clone = line.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".cm-ySelectionCaret, .cm-placeholder").forEach((node) => node.remove());
        return clone.textContent ?? "";
      })
      .join("\n");
  });
}

/**
 * Replaces the whole document with `source`.
 *
 * `insertText` rather than `type`: the editor auto-indents as you type, so
 * multi-line Python typed key by key comes out with doubled indentation and an
 * IndentationError. This inserts the text as written.
 */
export async function replaceSource(page: Page, source: string): Promise<void> {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(source);
}

export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

export async function typeAtStart(page: Page, text: string): Promise<void> {
  await page.locator(EDITOR).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(text);
}

/**
 * Creates a practice room through the UI and returns its URL.
 *
 * Goes through the problem page rather than a picker: that is now the only
 * route into a practice room, and exercising it here means every collaboration
 * test also covers "start a room from a problem".
 */
export async function createPracticeRoom(browser: Browser, problemSlug: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/problems/${problemSlug}`);
  await page.getByTestId("start-room").click();
  await page.waitForURL(ROOM_URL);
  const url = page.url();
  await context.close();
  return url;
}

/** Creates a blank room through the UI and returns the page still on it. */
export async function createBlankRoom(browser: Browser): Promise<{ page: Page; url: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("choose-blank").click();
  await page.waitForURL(ROOM_URL);
  await waitForSync(page);
  return { page, url: page.url() };
}
