import { type Page, expect } from "@playwright/test";

export class ServerPage {
  constructor(private page: Page) {}

  async getServerName() {
    return this.page.locator("h2.truncate").textContent();
  }

  async getInviteLink(): Promise<string> {
    // Open server dropdown by clicking the server name header button
    await this.page
      .locator("button", { has: this.page.locator("h2.truncate") })
      .click();

    // Click "Invite People"
    await this.page.getByText("Invite People").click();

    // Wait for the invite link input to have a value
    const input = this.page.locator('input[type="text"][readonly]');
    await expect(input).not.toHaveValue("", { timeout: 10_000 });

    const link = await input.inputValue();

    // Close modal
    await this.page.locator('button[aria-label="Close"]').click();

    return link;
  }
}
