import { type Page, expect } from "@playwright/test";

export class ChannelPage {
  constructor(private page: Page) {}

  async maybeUnlockCrypto(password: string) {
    const unlockButton = this.page.getByRole("button", { name: "Unlock" });
    try {
      await unlockButton.waitFor({ state: "visible", timeout: 3_000 });
    } catch {
      return; // No unlock prompt — already unlocked
    }
    await this.page.getByPlaceholder("Your password").fill(password);
    await unlockButton.click();
    await unlockButton.waitFor({ state: "hidden", timeout: 30_000 });
  }

  async sendMessage(text: string) {
    const input = this.page.getByRole("textbox", { name: "Message input" });
    await expect(input).toBeEnabled({ timeout: 10_000 });
    await input.fill(text);
    await input.press("Enter");
  }

  async waitForMessage(text: string) {
    await expect(this.page.getByText(text).first()).toBeVisible({
      timeout: 10_000,
    });
  }
}
