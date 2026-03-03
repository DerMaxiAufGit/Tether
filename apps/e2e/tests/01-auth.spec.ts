import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { makeUser } from "../fixtures/users";

test.describe("Authentication", () => {
  test("register → land on home", async ({ page }) => {
    const user = makeUser("auth");
    const auth = new AuthPage(page);

    await auth.register(user.email, user.displayName, user.password);
    await auth.acknowledgeRecoveryKey();
    await expect(page).toHaveURL("/");
  });

  test("logout → login → land on /", async ({ page }) => {
    const user = makeUser("login");
    const auth = new AuthPage(page);

    // Register first
    await auth.registerAndContinue(user.email, user.displayName, user.password);
    await expect(page).toHaveURL("/");

    // Logout by clearing cookies
    await page.context().clearCookies();
    await page.reload();
    await page.waitForURL("**/login", { timeout: 10_000 });

    // Login
    await auth.login(user.email, user.password);
    await expect(page).toHaveURL("/");
  });
});
