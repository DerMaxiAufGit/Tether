import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { AppShellPage } from "../pages/AppShellPage";
import { ChannelPage } from "../pages/ChannelPage";
import { makeUser } from "../fixtures/users";

test.describe("Messaging", () => {
  test("send message → verify it appears", async ({ page }) => {
    const user = makeUser("msg");
    const auth = new AuthPage(page);
    const shell = new AppShellPage(page);
    const channel = new ChannelPage(page);

    await auth.registerAndContinue(user.email, user.displayName, user.password);

    await shell.createServer(`Msg Server ${Date.now()}`);

    // Click the first text channel link
    await page.locator('a[href*="/channels/"]').first().click();
    await page.waitForURL("**/channels/**", { timeout: 10_000 });

    // Handle crypto unlock if needed
    await channel.maybeUnlockCrypto(user.password);

    // Send a message
    const msg = `Hello E2E ${Date.now()}`;
    await channel.sendMessage(msg);

    // Verify message appears
    await channel.waitForMessage(msg);
  });
});
