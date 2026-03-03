import { type Page, expect } from "@playwright/test";

export class AppShellPage {
  constructor(private page: Page) {}

  async createServer(name: string) {
    await this.page.locator('button[aria-label="Add a Server"]').click();
    await this.page.locator("#server-name").fill(name);
    await this.page.getByRole("button", { name: "Create Server" }).click();
    await this.page.waitForURL("**/servers/**", { timeout: 10_000 });
  }
}
