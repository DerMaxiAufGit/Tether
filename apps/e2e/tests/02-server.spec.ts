import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { AppShellPage } from "../pages/AppShellPage";
import { makeUser } from "../fixtures/users";

test.describe("Server Creation", () => {
  test("create server → verify URL and name", async ({ page }) => {
    const user = makeUser("server");
    const auth = new AuthPage(page);
    const shell = new AppShellPage(page);

    await auth.registerAndContinue(user.email, user.displayName, user.password);

    const serverName = `Test Server ${Date.now()}`;
    await shell.createServer(serverName);

    // URL should be /servers/:id
    expect(page.url()).toMatch(/\/servers\/[a-zA-Z0-9-]+/);

    // Server name should appear in the channel list header
    await expect(page.locator("h2.truncate")).toContainText(serverName);
  });
});
