import { type Page, expect } from "@playwright/test";

export class AuthPage {
  constructor(private page: Page) {}

  async register(email: string, displayName: string, password: string) {
    await this.page.goto("/register");
    await this.page.locator("#email").fill(email);
    await this.page.locator("#displayName").fill(displayName);
    await this.page.locator("#password").fill(password);
    await this.page.locator("#confirmPassword").fill(password);
    await this.page.getByRole("button", { name: "Create account" }).click();

    // Crypto (PBKDF2 600K iterations) + API call takes several seconds.
    // After success the app navigates to /recovery-key, but a PublicRoute
    // guard may race and redirect straight to /. Wait until we leave
    // the register page — we'll end up on /recovery-key or /.
    await this.page.waitForURL(
      (url) => !url.pathname.startsWith("/register"),
      { timeout: 45_000 },
    );
  }

  async acknowledgeRecoveryKey() {
    // The recovery key page may be skipped if the PublicRoute auth guard
    // redirects to / before RecoveryKeyPage mounts with router state.
    const heading = this.page.getByRole("heading", {
      name: "Save your recovery key",
    });

    const visible = await heading.isVisible().catch(() => false);
    if (!visible) {
      // Already at home — recovery key page was auto-skipped
      return;
    }

    await this.page
      .getByText("I have saved my recovery key in a safe place")
      .click();
    await this.page
      .getByRole("button", { name: "Continue to Tether" })
      .click();
    await this.page.waitForURL("/", { timeout: 10_000 });
  }

  async login(email: string, password: string) {
    await this.page.goto("/login");
    await this.page.locator("#email").fill(email);
    await this.page.locator("#password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await this.page.waitForURL("/", { timeout: 45_000 });
  }

  async registerAndContinue(
    email: string,
    displayName: string,
    password: string,
  ) {
    await this.register(email, displayName, password);
    await this.acknowledgeRecoveryKey();
  }
}
