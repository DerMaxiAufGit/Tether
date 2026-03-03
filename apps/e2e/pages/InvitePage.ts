import { type Page, expect } from "@playwright/test";

export class InvitePage {
  constructor(private page: Page) {}

  async goto(link: string) {
    // Extract path from full URL (e.g. http://localhost/invite/abc123 → /invite/abc123)
    const url = new URL(link);
    await this.page.goto(url.pathname);
  }

  async joinServer() {
    await this.page
      .getByRole("button", { name: /^Join / })
      .click();
    await this.page.waitForURL("**/servers/**", { timeout: 10_000 });
  }
}
