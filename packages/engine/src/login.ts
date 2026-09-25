import type { Page } from "playwright";
import type { Credentials } from "./types";

const USER_FIELD =
  'input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[id*="user" i], input[id*="email" i]';

export async function hasPasswordField(page: Page): Promise<boolean> {
  return (await page.locator('input[type="password"]').filter({ visible: true }).count()) > 0;
}

/** Best-effort form login. Returns null on success, or an error message. Never logs the values. */
export async function tryLogin(page: Page, creds: Credentials): Promise<string | null> {
  const password = page.locator('input[type="password"]').filter({ visible: true }).first();
  if ((await password.count()) === 0) return "login failed: no password field on page";

  const form = password.locator("xpath=ancestor::form[1]");
  const scope = (await form.count()) > 0 ? form : page.locator("body");
  const user = scope.locator(USER_FIELD).filter({ visible: true }).first();
  if ((await user.count()) === 0)
    return "login failed: no username/email field next to the password field";

  await user.fill(creds.email);
  await password.fill(creds.password);
  const submit = scope
    .locator('button[type="submit"], input[type="submit"], button:not([type])')
    .filter({ visible: true })
    .first();
  await Promise.all([
    page.waitForLoadState("load").catch(() => {}),
    (await submit.count()) > 0 ? submit.click() : password.press("Enter"),
  ]);
  await page.waitForTimeout(1500);

  return (await hasPasswordField(page))
    ? "login failed: password field still visible after submit"
    : null;
}
