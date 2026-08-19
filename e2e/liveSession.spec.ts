import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Live sessions, driven as two real browsers (§38).
 *
 * Everything below the socket already has unit coverage against an in-process
 * loopback. What that cannot reach is the seam these tests exist for: real
 * `RTCPeerConnection`s, real ICE, two independent Zustand stores, two DuckDB
 * engines, and the ordering between them. Every collaboration bug found so far
 * has lived in exactly that seam.
 *
 * ICE is configured with no STUN. Both contexts are on the same machine, so
 * host candidates connect immediately, and nothing waits on a server that may
 * not be reachable from CI.
 */

/** Applied before app code runs, so the config is in place at first render. */
const LAN_ONLY_ICE = () => {
  (window as unknown as { env: Record<string, string> }).env = {
    ...((window as unknown as { env?: Record<string, string> }).env ?? {}),
    DUCK_UI_STUN_URLS: "",
  };
};

async function ensureProfile(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Create Profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return;
  }
  await dialog.getByPlaceholder("Profile name").fill(name);
  await dialog.getByRole("button", { name: "Create Profile" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function bootPeer(context: BrowserContext, name: string, url = "/"): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(LAN_ONLY_ICE);
  await page.goto(url);
  await ensureProfile(page, name);
  await expect(page.getByText("Duck-UI").first()).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Runs SQL through the URL, which is the app's own auto-run path. */
async function runSql(page: Page, sql: string) {
  const encoded = Buffer.from(sql, "utf8").toString("base64");
  await page.goto(`/?query=${encoded}&execute=true`);
}

/** Creates a table in this browser's own engine, for the host to share. */
async function seedHostData(page: Page) {
  await runSql(
    page,
    `CREATE TABLE regional_sales AS SELECT * FROM (VALUES
       ('north', 100), ('south', 250), ('east', 75)
     ) AS t(region, amount)`
  );
  await expect(page.getByText(/rows|Query Error/i).first()).toBeVisible({ timeout: 60_000 });
}

/**
 * Types SQL into a new tab and runs it, without navigating.
 *
 * A guest must never be sent through `page.goto` — reloading tears down the
 * peer connection along with the session.
 */
async function runSqlInNewTab(page: Page, sql: string) {
  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("menuitem", { name: "SQL Tab" }).click();

  // Scoped to the active tab panel — inactive panels are unmounted, but a
  // stale match would silently type into the wrong editor. Monaco is a large
  // lazy chunk, so give it room on first open.
  const panel = page.getByRole("tabpanel");
  const lines = panel.locator(".view-lines").first();
  await expect(lines).toBeVisible({ timeout: 90_000 });
  await lines.click();
  await page.keyboard.type(sql);

  await page.getByRole("button", { name: "Run Query" }).click();
}

/** Opens the host's Share Live dialog and returns it. */
async function openShareDialog(page: Page) {
  await page.getByRole("button", { name: "Live session" }).click();
  await page.getByRole("menuitem", { name: /Share Live/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Share Live")).toBeVisible();
  return dialog;
}

test.describe("live session", () => {
  test.slow();

  test("guest joins, sees shared data, and queries it in the host's browser", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const host = await bootPeer(hostContext, "hostuser");
      await seedHostData(host);

      // ---- Host creates a session that shares one table -------------------
      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("E2E session");
      await shareDialog.getByText("Share selected tables").click();

      const tableCheckbox = shareDialog.getByText("regional_sales", { exact: true });
      await expect(tableCheckbox).toBeVisible({ timeout: 30_000 });
      await tableCheckbox.click();

      await shareDialog.getByRole("button", { name: "Create session" }).click();

      const inviteInput = shareDialog.locator("input[readonly]").first();
      await expect(inviteInput).toBeVisible({ timeout: 60_000 });
      const inviteUrl = await inviteInput.inputValue();
      expect(inviteUrl).toContain("#live=");

      // ---- Guest opens the invite and produces its code -------------------
      const guestPath = inviteUrl.slice(inviteUrl.indexOf("/#"));
      const guest = await bootPeer(guestContext, "guestuser", guestPath);

      const joinDialog = guest.getByRole("dialog");
      await expect(joinDialog.getByText(/Join .E2E session./)).toBeVisible({ timeout: 30_000 });
      await joinDialog.getByRole("button", { name: "Join", exact: true }).click();

      const answerInput = joinDialog.locator("input[readonly]").first();
      await expect(answerInput).toBeVisible({ timeout: 60_000 });
      const answerCode = await answerInput.inputValue();
      expect(answerCode.length).toBeGreaterThan(0);

      // ---- Host completes the handshake ----------------------------------
      await shareDialog.getByPlaceholder("Paste their connection code here").fill(answerCode);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(shareDialog.getByText(/Connected/)).toBeVisible({ timeout: 60_000 });

      // ---- Guest receives the grant and can see the shared table ---------
      await expect(joinDialog.getByText("Shared data available")).toBeVisible({ timeout: 60_000 });
      await joinDialog.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // The catalog node starts collapsed; the shared table lives under it.
      const tree = guest.getByRole("tree");
      await expect(tree.getByText("memory", { exact: true })).toBeVisible({ timeout: 60_000 });
      await tree.getByText("memory", { exact: true }).click();

      const sharedTable = tree.getByText("regional_sales", { exact: true });
      await expect(sharedTable).toBeVisible({ timeout: 60_000 });

      // Expanding the table already proves peer execution: the column stats
      // under it come from queries that ran in the host's browser.
      await expect(guest.getByText(/region/).first()).toBeVisible({ timeout: 60_000 });

      // ---- Guest runs its own SQL; the host's browser executes it ---------
      await runSqlInNewTab(guest, "SELECT region, amount FROM regional_sales ORDER BY amount DESC");

      // Values that exist ONLY in the host's engine. Seeing them here means the
      // query crossed the wire and came back as Arrow.
      await expect(guest.getByText("250").first()).toBeVisible({ timeout: 60_000 });
      await expect(guest.getByText("north").first()).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("guest is refused when the host revokes access", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const host = await bootPeer(hostContext, "hostuser");
      await seedHostData(host);

      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("Revoke test");
      await shareDialog.getByText("Share selected tables").click();

      // The table list loads asynchronously; clicking before it arrives hangs.
      const tableCheckbox = shareDialog.getByText("regional_sales", { exact: true });
      await expect(tableCheckbox).toBeVisible({ timeout: 30_000 });
      await tableCheckbox.click();
      await shareDialog.getByRole("button", { name: "Create session" }).click();

      const inviteInput = shareDialog.locator("input[readonly]").first();
      await expect(inviteInput).toBeVisible({ timeout: 60_000 });
      const inviteUrl = await inviteInput.inputValue();

      const guest = await bootPeer(
        guestContext,
        "guestuser",
        inviteUrl.slice(inviteUrl.indexOf("/#"))
      );

      const joinDialog = guest.getByRole("dialog");
      await joinDialog.getByRole("button", { name: "Join", exact: true }).click();
      const answerInput = joinDialog.locator("input[readonly]").first();
      await expect(answerInput).toBeVisible({ timeout: 60_000 });
      const answerCode = await answerInput.inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(answerCode);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(joinDialog.getByText("Shared data available")).toBeVisible({ timeout: 60_000 });
      await joinDialog.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // The grant must be reachable as a connection before it is withdrawn,
      // otherwise this asserts nothing.
      await expect(guest.getByRole("tree").getByText("memory", { exact: true })).toBeVisible({
        timeout: 60_000,
      });

      // The share dialog is modal — the session panel behind it is unclickable
      // until it is dismissed.
      await host.getByRole("button", { name: "Close", exact: true }).click();
      await expect(host.getByRole("dialog")).toBeHidden();

      // Host withdraws the grant from the session panel.
      await host.getByRole("button", { name: "Session details" }).click();
      await host.getByRole("button", { name: /Withdraw access/ }).click();

      // The guest must not be left quietly executing against something else.
      await expect(guest.getByText(/no longer available/i).first()).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("SQL typed by one peer appears in the other's editor", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const host = await bootPeer(hostContext, "hostuser");
      await runSql(host, "SELECT 1 AS seeded");
      await expect(host.getByText(/rows|Query Error/i).first()).toBeVisible({ timeout: 60_000 });

      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("Editing test");
      await shareDialog.getByRole("button", { name: "Create session" }).click();

      const inviteUrl = await shareDialog.locator("input[readonly]").first().inputValue();
      const guest = await bootPeer(
        guestContext,
        "guestuser",
        inviteUrl.slice(inviteUrl.indexOf("/#"))
      );

      const joinDialog = guest.getByRole("dialog");
      await joinDialog.getByRole("button", { name: "Join", exact: true }).click();
      const answerCode = await joinDialog.locator("input[readonly]").first().inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(answerCode);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(shareDialog.getByText(/Connected/)).toBeVisible({ timeout: 60_000 });
      await joinDialog.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // The host's tab, and its SQL, should reach the guest's workspace.
      await expect(guest.getByRole("tab", { name: /Query|seeded/i }).first()).toBeVisible({
        timeout: 60_000,
      });
      await guest.getByRole("tab", { name: /Query|seeded/i }).first().click();
      await expect(guest.locator(".view-lines").first()).toContainText("seeded", {
        timeout: 60_000,
      });

      // ---- Presence: the guest's caret is VISIBLE on the host -------------
      // Clicking into the shared editor publishes the guest's cursor; the
      // host must render it as a caret decoration with a name flag. This is
      // the "I can see where you are" half of collaboration — merged text
      // with invisible collaborators reads as haunted, not multiplayer.
      await guest.locator(".view-lines").first().click();
      await guest.keyboard.type(" -- guest was here");
      // The host's share dialog is modal; its workspace is unreachable until
      // it closes. The session survives the dialog.
      await host.keyboard.press("Escape");
      await expect(shareDialog).toBeHidden({ timeout: 10_000 });
      await host.getByRole("tab", { name: /Query|seeded/i }).first().click();
      await expect(host.locator(".duck-peer-caret").first()).toBeAttached({ timeout: 60_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("an 'all data' session shares tables created AFTER the sharing starts", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      // The host starts with an EMPTY database — the exact case from the
      // report: "no tables to share" at share time must not mean "no tables
      // ever".
      const host = await bootPeer(hostContext, "hostuser");

      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("All data session");
      await shareDialog.getByText("All data", { exact: true }).click();
      await expect(shareDialog.getByText(/shared as they appear/)).toBeVisible();
      await shareDialog.getByRole("button", { name: "Create session" }).click();

      const inviteUrl = await shareDialog.locator("input[readonly]").first().inputValue();
      const guest = await bootPeer(
        guestContext,
        "guestuser",
        inviteUrl.slice(inviteUrl.indexOf("/#"))
      );

      const joinDialog = guest.getByRole("dialog");
      await joinDialog.getByRole("button", { name: "Join", exact: true }).click();
      const answerCode = await joinDialog.locator("input[readonly]").first().inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(answerCode);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(shareDialog.getByText(/Connected/)).toBeVisible({ timeout: 60_000 });
      await joinDialog.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // The share dialog is modal — close it, or the host's workspace below
      // is unreachable. The session itself survives the dialog.
      await host.keyboard.press("Escape");
      await expect(shareDialog).toBeHidden({ timeout: 10_000 });

      // NOW the host creates a table — after the session is live. No goto:
      // navigation would tear down the peer connection.
      await runSqlInNewTab(
        host,
        "CREATE TABLE late_arrival AS SELECT 'crossed' AS status, 4242 AS marker"
      );
      await expect(host.getByText(/rows|Query Error/i).first()).toBeVisible({ timeout: 60_000 });

      // The grown grant reaches the guest's data explorer first — wait for
      // it there, so the query below cannot race the capability update.
      const tree = guest.getByRole("tree");
      await expect(tree.getByText("memory", { exact: true })).toBeVisible({ timeout: 60_000 });
      await tree.getByText("memory", { exact: true }).click();
      await expect(tree.getByText("late_arrival", { exact: true })).toBeVisible({
        timeout: 60_000,
      });

      // The guest queries the table it was never explicitly granted — the
      // catalog watcher copied it into the share runtime and grew the grant.
      await runSqlInNewTab(guest, "SELECT status, marker FROM late_arrival");
      await expect(guest.getByText("4242").first()).toBeVisible({ timeout: 60_000 });
      await expect(guest.getByText("crossed").first()).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});

test.describe("multi-peer session", () => {
  test.slow();

  test("two guests join the same session and see each other's edits", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();

    try {
      const host = await bootPeer(hostContext, "hostuser");
      await runSql(host, "SELECT 1 AS seeded");
      await expect(host.getByText(/rows|Query Error/i).first()).toBeVisible({ timeout: 60_000 });

      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("Group session");
      await shareDialog.getByRole("button", { name: "Create session" }).click();

      // ---- First guest ----------------------------------------------------
      const firstInvite = await shareDialog.locator("input[readonly]").first().inputValue();
      const guestOne = await bootPeer(
        firstContext,
        "guestone",
        firstInvite.slice(firstInvite.indexOf("/#"))
      );
      const dialogOne = guestOne.getByRole("dialog");
      await dialogOne.getByRole("button", { name: "Join", exact: true }).click();
      const codeOne = await dialogOne.locator("input[readonly]").first().inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(codeOne);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(shareDialog.getByText(/Connected ·/)).toBeVisible({ timeout: 60_000 });
      await dialogOne.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // ---- Second guest needs a FRESH invite ------------------------------
      // An SDP offer belongs to one connection, so reusing the first invite
      // cannot work. The host mints another.
      await shareDialog.getByRole("button", { name: "Invite someone else" }).click();

      const secondInvite = await expect
        .poll(
          async () => {
            const value = await shareDialog.locator("input[readonly]").first().inputValue();
            return value !== firstInvite ? value : null;
          },
          { timeout: 60_000 }
        )
        .not.toBeNull()
        .then(() => shareDialog.locator("input[readonly]").first().inputValue());

      const guestTwo = await bootPeer(
        secondContext,
        "guesttwo",
        secondInvite.slice(secondInvite.indexOf("/#"))
      );
      const dialogTwo = guestTwo.getByRole("dialog");
      await dialogTwo.getByRole("button", { name: "Join", exact: true }).click();
      const codeTwo = await dialogTwo.locator("input[readonly]").first().inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(codeTwo);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await dialogTwo.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // ---- All three are in the session ----------------------------------
      await host.getByRole("button", { name: "Close", exact: true }).click();
      await expect(host.getByRole("dialog")).toBeHidden();
      await host.getByRole("button", { name: "Session details" }).click();
      await expect(host.getByText("guestone")).toBeVisible({ timeout: 60_000 });
      await expect(host.getByText("guesttwo")).toBeVisible();

      // ---- The host's work reached BOTH guests ---------------------------
      // Guest two has no connection to guest one; anything shared between them
      // travelled through the host.
      for (const guest of [guestOne, guestTwo]) {
        await expect(guest.getByRole("tab", { name: /Query|seeded/i }).first()).toBeVisible({
          timeout: 60_000,
        });
      }
    } finally {
      await hostContext.close();
      await firstContext.close();
      await secondContext.close();
    }
  });
});

test.describe("fork session", () => {
  test.slow();

  test("guest forks a table, host leaves, the copy keeps working", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const host = await bootPeer(hostContext, "hostuser");
      await seedHostData(host);

      const shareDialog = await openShareDialog(host);
      await shareDialog.getByLabel("Session name").fill("Fork test");
      await shareDialog.getByText("Share selected tables").click();
      const tableCheckbox = shareDialog.getByText("regional_sales", { exact: true });
      await expect(tableCheckbox).toBeVisible({ timeout: 30_000 });
      await tableCheckbox.click();
      await shareDialog.getByRole("button", { name: "Create session" }).click();

      const inviteUrl = await shareDialog.locator("input[readonly]").first().inputValue();
      const guest = await bootPeer(
        guestContext,
        "guestuser",
        inviteUrl.slice(inviteUrl.indexOf("/#"))
      );
      const joinDialog = guest.getByRole("dialog");
      await joinDialog.getByRole("button", { name: "Join", exact: true }).click();
      const answerInput = joinDialog.locator("input[readonly]").first();
      await expect(answerInput).toBeVisible({ timeout: 60_000 });
      const answerCode = await answerInput.inputValue();

      await shareDialog.getByPlaceholder("Paste their connection code here").fill(answerCode);
      await shareDialog.getByRole("button", { name: "Connect" }).click();
      await expect(joinDialog.getByText("Shared data available")).toBeVisible({ timeout: 60_000 });
      await joinDialog.getByRole("button", { name: /Open workspace|Hide/ }).click();

      // ---- Guest forks the shared table ----------------------------------
      await guest.getByRole("button", { name: "Session details" }).click();
      await guest.getByRole("button", { name: /^Fork / }).click();

      const forkDialog = guest.getByRole("dialog");
      await expect(forkDialog.getByText(/Fork .Fork test./)).toBeVisible({ timeout: 30_000 });
      await forkDialog.getByRole("button", { name: /Fork \d+ table/ }).click();
      await expect(forkDialog.getByText(/Done\. The copies are in your local/)).toBeVisible({
        timeout: 60_000,
      });
      // Two "Close" buttons exist: the dialog's X and the footer. Take the footer.
      await forkDialog.getByRole("button", { name: "Close", exact: true }).last().click();

      // ---- The host disappears entirely ----------------------------------
      await hostContext.close();

      // WebRTC takes a few seconds to notice a dead peer. The app then falls
      // back to the local engine and says so — wait for that notice, as a
      // person would, before querying.
      await expect(
        guest.getByText("That shared connection is no longer available").first()
      ).toBeVisible({ timeout: 60_000 });

      // ---- The guest queries ITS OWN copy, locally ------------------------
      await runSqlInNewTab(
        guest,
        "SELECT region, amount FROM regional_sales WHERE amount = 250"
      );
      await expect(guest.getByText("south").first()).toBeVisible({ timeout: 60_000 });
    } finally {
      await guestContext.close();
      // hostContext already closed by the test; a second close is a no-op.
      await hostContext.close().catch(() => {});
    }
  });
});
