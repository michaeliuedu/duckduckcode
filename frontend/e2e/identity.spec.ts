import { expect, test } from "@playwright/test";
import { createBlankRoom, createPracticeRoom, openSession } from "./helpers";

// Who you are in a room: the name and the caret colour other people see.

test("your name and colour are visible to the other side and survive a reload", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "two-sum");
  const ada = await openSession(browser, url, "Ada");
  const lin = await openSession(browser, url, "Lin");

  // Pick a colour from the palette.
  await ada.getByTestId("color-button").click();
  await expect(ada.getByTestId("color-palette")).toBeVisible();
  await ada.getByTestId("color-a855f7").click();
  await expect(ada.getByTestId("color-palette")).toHaveCount(0);

  // The avatar takes the new colour, here and on the other side.
  const ownAvatar = ada.locator('[data-testid="peer"][data-peer-name="Ada"]');
  await expect(ownAvatar).toHaveCSS("background-color", "rgb(168, 85, 247)");
  await expect(lin.locator('[data-testid="peer"][data-peer-name="Ada"]')).toHaveCSS(
    "background-color",
    "rgb(168, 85, 247)",
  );

  // Identity is per browser, not per room: a reload keeps it.
  await ada.reload();
  await expect(ada.getByTestId("name-input")).toHaveValue("Ada");
  await expect(ada.locator('[data-testid="peer"][data-peer-name="Ada"]')).toHaveCSS(
    "background-color",
    "rgb(168, 85, 247)",
  );

  await ada.context().close();
  await lin.context().close();
});

test("renaming yourself updates the caret label the other side sees", async ({ browser }) => {
  const url = await createPracticeRoom(browser, "longest-substring-without-repeating-characters");
  const ada = await openSession(browser, url, "Ada");
  const lin = await openSession(browser, url, "Lin");

  // Put a caret in the document so the other side renders a label for it.
  await ada.locator('[data-testid="editor"]').click();
  await expect(lin.locator(".cm-ySelectionInfo")).toHaveText("Ada");

  const nameInput = ada.getByTestId("name-input");
  await nameInput.fill("Ana (renamed)");
  await nameInput.press("Enter");

  await expect(lin.locator('[data-testid="peer"][data-peer-name="Ana (renamed)"]')).toBeVisible();
  await expect(lin.locator(".cm-ySelectionInfo")).toHaveText("Ana (renamed)");

  await ada.context().close();
  await lin.context().close();
});

test("the colour palette closes on Escape and on a click elsewhere", async ({ browser }) => {
  const { page } = await createBlankRoom(browser);

  await page.getByTestId("color-button").click();
  await expect(page.getByTestId("color-palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("color-palette")).toHaveCount(0);

  await page.getByTestId("color-button").click();
  await expect(page.getByTestId("color-palette")).toBeVisible();
  await page.getByTestId("room-title").click();
  await expect(page.getByTestId("color-palette")).toHaveCount(0);

  await page.context().close();
});

test("a blank name is refused rather than leaving you anonymous", async ({ browser }) => {
  const { page } = await createBlankRoom(browser);

  const nameInput = page.getByTestId("name-input");
  await nameInput.fill("Named");
  await nameInput.press("Enter");
  await expect(page.locator('[data-testid="peer"][data-peer-name="Named"]')).toBeVisible();

  await nameInput.fill("   ");
  await nameInput.press("Enter");
  await expect(page.locator('[data-testid="peer"][data-peer-name="Named"]')).toBeVisible();

  await page.context().close();
});
