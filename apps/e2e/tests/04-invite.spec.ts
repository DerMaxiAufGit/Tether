import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { AppShellPage } from "../pages/AppShellPage";
import { ServerPage } from "../pages/ServerPage";
import { InvitePage } from "../pages/InvitePage";
import { makeUser } from "../fixtures/users";

test.describe("Invite Flow", () => {
  test("owner creates invite → invitee joins server", async ({ browser }) => {
    // --- Owner context ---
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    const owner = makeUser("owner");
    const ownerAuth = new AuthPage(ownerPage);
    const shell = new AppShellPage(ownerPage);
    const server = new ServerPage(ownerPage);

    await ownerAuth.registerAndContinue(
      owner.email,
      owner.displayName,
      owner.password,
    );

    const serverName = `Invite Server ${Date.now()}`;
    await shell.createServer(serverName);

    // Get invite link
    const inviteLink = await server.getInviteLink();
    expect(inviteLink).toContain("/invite/");

    // --- Invitee context ---
    const inviteeCtx = await browser.newContext();
    const inviteePage = await inviteeCtx.newPage();

    const invitee = makeUser("invitee");
    const inviteeAuth = new AuthPage(inviteePage);
    const invite = new InvitePage(inviteePage);

    await inviteeAuth.registerAndContinue(
      invitee.email,
      invitee.displayName,
      invitee.password,
    );

    // Navigate to invite link and join
    await invite.goto(inviteLink);
    await invite.joinServer();

    // Verify invitee lands on the server page
    expect(inviteePage.url()).toMatch(/\/servers\/[a-zA-Z0-9-]+/);

    await ownerCtx.close();
    await inviteeCtx.close();
  });
});
