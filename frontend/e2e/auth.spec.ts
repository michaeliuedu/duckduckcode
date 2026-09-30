import { expect, test, type Browser, type Page } from "@playwright/test";
import { createBlankRoom, editorText, typeAtEnd, waitForSync } from "./helpers";

// Accounts. The rule that matters most is at the bottom: adding sign-in must
// not put a wall between a reader and a room link.

let accountSeq = 0;

/** A fresh account's details. The database persists between tests. */
function newAccount() {
  accountSeq += 1;
  const unique = `${Date.now().toString(36)}${accountSeq}`;
  return {
    email: `ana-${unique}@example.edu`,
    handle: `ana${unique}`,
    displayName: `Ana ${accountSeq}`,
    password: "a good long password",
  };
}

type Account = ReturnType<typeof newAccount>;

async function signUp(page: Page, account: Account) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Username").fill(account.handle);
  await page.getByLabel("Display name").fill(account.displayName);
  await page.getByLabel("Password").fill(account.password);
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("account-button")).toBeVisible();
}

/** Signs up in a brand-new context, so each test gets its own browser state. */
async function signedUpSession(browser: Browser): Promise<{ page: Page; account: Account }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = newAccount();
  await signUp(page, account);
  return { page, account };
}

test("sign up, stay signed in across a reload, sign out", async ({ browser }) => {
  const { page, account } = await signedUpSession(browser);

  // The session survives a full page load, which is the point of the cookie.
  await page.reload();
  await expect(page.getByTestId("account-button")).toBeVisible();

  await page.getByTestId("account-button").click();
  await expect(page.getByTestId("account-menu")).toContainText(account.displayName);
  await expect(page.getByTestId("account-menu")).toContainText(`@${account.handle}`);

  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in-link")).toBeVisible();

  // And it is really gone, not just hidden.
  await page.reload();
  await expect(page.getByTestId("sign-in-link")).toBeVisible();

  await page.context().close();
});

test("the session cookie is not readable from script", async ({ browser }) => {
  const { page } = await signedUpSession(browser);
  // HttpOnly means an XSS bug in someone's problem statement cannot lift the
  // session. Worth asserting from the page itself rather than trusting a flag.
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain("ddc_session");
  await page.context().close();
});

test("signing in again works, and a wrong password is refused inline", async ({ browser }) => {
  const { page, account } = await signedUpSession(browser);
  await page.getByTestId("account-button").click();
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in-link")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("not the right password");
  await page.getByTestId("login-submit").click();

  // The page stays put and explains itself rather than throwing an error page.
  await expect(page.getByTestId("form-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId("sign-in-link")).toBeVisible();

  await page.getByLabel("Password").fill(account.password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("account-button")).toBeVisible();

  await page.context().close();
});

test("signup rejects a duplicate email and says which field is wrong", async ({ browser }) => {
  const { page, account } = await signedUpSession(browser);
  await page.getByTestId("account-button").click();
  await page.getByTestId("sign-out").click();

  await page.goto("/signup");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Username").fill(`${account.handle}x`);
  await page.getByLabel("Password").fill("a good long password");
  await page.getByTestId("signup-submit").click();

  await expect(page.getByTestId("signup-form")).toContainText(/already has an account/i);
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");

  await page.context().close();
});

test("signup reports a too-short password without losing what was typed", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = newAccount();

  await page.goto("/signup");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Username").fill(account.handle);
  await page.getByLabel("Password").fill("short");
  // The field has minLength, so bypass native validation to exercise the server.
  await page.getByTestId("signup-form").evaluate((form: HTMLFormElement) => form.setAttribute("novalidate", ""));
  await page.getByTestId("signup-submit").click();

  await expect(page.getByTestId("signup-form")).toContainText(/at least 10 characters/i);
  await expect(page.getByLabel("Email")).toHaveValue(account.email);
  await expect(page.getByLabel("Username")).toHaveValue(account.handle);

  await context.close();
});

test("a guarded page sends you to sign in and back again", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);

  const account = newAccount();
  await page.goto(`/signup?next=${encodeURIComponent("/settings")}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Username").fill(account.handle);
  await page.getByLabel("Password").fill(account.password);
  await page.getByTestId("signup-submit").click();

  // Straight to where they were headed, not to the lobby.
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("profile-form")).toBeVisible();

  await context.close();
});

test("the sign-in page refuses to bounce you to another site", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = newAccount();

  // An open redirect here would make a phishing link look like ours.
  await page.goto(`/signup?next=${encodeURIComponent("https://evil.example/phish")}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Username").fill(account.handle);
  await page.getByLabel("Password").fill(account.password);
  await page.getByTestId("signup-submit").click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await context.close();
});

test("settings updates the profile, and the new name reaches a room", async ({ browser }) => {
  const { page, account } = await signedUpSession(browser);

  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Ana Renamed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByTestId("form-success")).toBeVisible();

  // A room shows the account name rather than a generated one, and does not
  // offer to edit it there.
  const { page: roomPage } = await createBlankRoom(browser);
  await roomPage.context().close();

  await page.goto("/");
  await page.getByTestId("choose-blank").click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(page);
  await expect(page.getByTestId("name-display")).toHaveText("Ana Renamed");
  await expect(page.getByTestId("name-input")).toHaveCount(0);
  await expect(page.locator('[data-testid="peer"][data-peer-name="Ana Renamed"]')).toBeVisible();

  expect(account.displayName).not.toBe("Ana Renamed");
  await page.context().close();
});

test("changing the password signs other browsers out", async ({ browser }) => {
  const { page: first, account } = await signedUpSession(browser);

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto("/login");
  await second.getByLabel("Email").fill(account.email);
  await second.getByLabel("Password").fill(account.password);
  await second.getByTestId("login-submit").click();
  await expect(second.getByTestId("account-button")).toBeVisible();

  await first.goto("/settings");
  await first.getByLabel("Current password").fill(account.password);
  await first.getByLabel("New password").fill("an even better password");
  await first.getByRole("button", { name: "Change password" }).click();
  await expect(first.getByTestId("form-success")).toBeVisible();

  // The other browser's session is dead on its next request.
  await second.reload();
  await expect(second.getByTestId("sign-in-link")).toBeVisible();

  await first.context().close();
  await secondContext.close();
});

// ---------------------------------------------------------------------------
// The regression that matters
// ---------------------------------------------------------------------------

test("a room link still works with no account at all", async ({ browser }) => {
  // Lin creates a room while signed in.
  const { page: lin } = await signedUpSession(browser);
  await lin.goto("/");
  await lin.getByTestId("choose-blank").click();
  await lin.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await waitForSync(lin);
  const url = lin.url();
  await typeAtEnd(lin, "print('from lin')");

  // Ada follows the link in a browser that has never signed in.
  const adaContext = await browser.newContext();
  const ada = await adaContext.newPage();
  await ada.goto(url);
  await waitForSync(ada);

  // No sign-in wall, the document is there, and they can edit it.
  await expect(ada.getByTestId("sign-in-link")).toBeVisible();
  await expect.poll(() => editorText(ada)).toContain("from lin");
  await typeAtEnd(ada, "\nprint('and ada')");
  await expect.poll(() => editorText(lin)).toContain("and ada");

  // They can still name themselves, the anonymous way.
  const nameInput = ada.getByTestId("name-input");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Curious Visitor");
  await nameInput.press("Enter");
  await expect(lin.locator('[data-testid="peer"][data-peer-name="Curious Visitor"]')).toBeVisible();

  await lin.context().close();
  await adaContext.close();
});

test("browsing and starting a room work signed out", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByTestId("choose-blank")).toBeVisible();
  await expect(page.getByTestId("problem-card-two-sum")).toBeVisible();

  await page.getByTestId("problem-card-two-sum").click();
  await expect(page.getByTestId("problem-title")).toHaveText("Two Sum");
  // Writing needs an account; reading and starting a room do not.
  await expect(page.getByTestId("add-to-list")).toHaveCount(0);
  await page.getByTestId("start-room").click();
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);

  await context.close();
});
