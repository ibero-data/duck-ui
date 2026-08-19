import { test, expect, type Page } from "@playwright/test";

/**
 * Dashboards as Evidence-style markdown documents, through the real UI.
 *
 * The reload test is the one that matters most: "I made a dashboard, reloaded,
 * and it was gone" was a real report. It was a save that silently never
 * happened (a blocked IndexedDB upgrade), which is exactly the kind of failure
 * only a full persist-and-reboot cycle can catch.
 */

const b64 = (sql: string) => Buffer.from(sql, "utf8").toString("base64");

async function ensureProfile(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Create Profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return;
  }
  await dialog.getByPlaceholder("Profile name").fill("e2e");
  await dialog.getByRole("button", { name: "Create Profile" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/** Boots the app with a query already run, so there is a result to add. */
async function bootWithResult(page: Page, sql: string) {
  await page.goto(`/?query=${b64(sql)}&execute=true`);
  await ensureProfile(page);
  await expect(page.getByText(/rows/i).first()).toBeVisible({ timeout: 60_000 });
}

/** Adds the current result to a brand new dashboard by name. */
async function addToNewDashboard(page: Page, name: string) {
  await page.getByRole("button", { name: "Add to dashboard" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add to dashboard")).toBeVisible();
  await dialog.getByPlaceholder("Q3 overview").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe("markdown dashboards", () => {
  test.slow();

  test("a query result becomes a live document that renders real values", async ({ page }) => {
    await bootWithResult(
      page,
      `SELECT * FROM (VALUES ('north', 100), ('south', 250)) AS t(region, amount)`
    );

    await addToNewDashboard(page, "E2E report");

    // Adding opens the dashboard tab; the document runs its query and renders
    // values that only exist in the engine, not in the markdown.
    await expect(page.getByRole("tab", { name: "E2E report" })).toBeVisible({ timeout: 30_000 });
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("250").first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText("north").first()).toBeVisible();
  });

  test("a dashboard SURVIVES a reload, and is reachable from the list", async ({ page }) => {
    await bootWithResult(page, `SELECT 'persistent' AS marker, 777 AS value`);
    await addToNewDashboard(page, "Survives reload");

    await expect(page.getByRole("tabpanel").getByText("777").first()).toBeVisible({
      timeout: 60_000,
    });

    // Give the debounced workspace auto-save its window, then reboot cold.
    await page.waitForTimeout(2_500);
    await page.reload();
    await ensureProfile(page);

    // The tab is restored AND the document re-runs its query.
    await expect(page.getByRole("tab", { name: "Survives reload" })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("tab", { name: "Survives reload" }).click();
    await expect(page.getByRole("tabpanel").getByText("777").first()).toBeVisible({
      timeout: 60_000,
    });

    // And even with every tab closed, the list still reaches it.
    await page.getByRole("button", { name: "Dashboards", exact: true }).click();
    await expect(page.getByText("Survives reload").first()).toBeVisible({ timeout: 30_000 });
  });

  test("editing the source live-renders new components", async ({ page }) => {
    await page.goto("/");
    await ensureProfile(page);
    await expect(page.getByText("Duck-UI").first()).toBeVisible({ timeout: 60_000 });

    // Create from the dashboards panel.
    await page.getByRole("button", { name: "Dashboards", exact: true }).click();
    await page.getByPlaceholder("New dashboard name").fill("Authored");
    await page.getByRole("button", { name: "New", exact: true }).click();

    // The starter document already declares a query and a DataTable.
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("hello").first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText("42").first()).toBeVisible();

    // Edit mode is a split pane: source left, live document right.
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(panel.locator(".view-lines").first()).toBeVisible({ timeout: 60_000 });
    // The preview keeps rendering while editing.
    await expect(panel.getByText("42").first()).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(panel.locator(".view-lines")).toHaveCount(0);
  });

  test("the editor autocompletes components, and accepting one scaffolds its props", async ({
    page,
  }) => {
    await page.goto("/");
    await ensureProfile(page);
    await expect(page.getByText("Duck-UI").first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Dashboards", exact: true }).click();
    await page.getByPlaceholder("New dashboard name").fill("Assisted");
    await page.getByRole("button", { name: "New", exact: true }).click();

    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("42").first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Edit" }).click();

    const editor = panel.locator(".view-lines").first();
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await editor.click();

    // Start a component tag on a fresh line: the suggest widget must offer
    // the component by name...
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("<BarCh");
    const suggest = page.locator(".suggest-widget");
    await expect(suggest).toBeVisible({ timeout: 30_000 });
    await expect(suggest.getByText("BarChart").first()).toBeVisible();

    // ...and accepting it scaffolds data/x/y with tabstops, not just the word.
    await page.keyboard.press("Enter");
    await expect(editor).toContainText("BarChart data=", { timeout: 30_000 });

    // The data slot is a choice of the queries that exist in this document,
    // so the picker with the starter's query opens without any typing.
    await expect(suggest).toBeVisible({ timeout: 30_000 });
    await expect(suggest.getByText("my_query").first()).toBeVisible();

    // Accepting the choice completes a runnable component reference.
    await page.keyboard.press("Enter");
    await expect(editor).toContainText("data={my_query}", { timeout: 30_000 });
  });

  test("a failing query shows its error in place, not a blank page", async ({ page }) => {
    await bootWithResult(page, `SELECT 1 AS n`);
    await addToNewDashboard(page, "Error handling");

    await expect(page.getByRole("tabpanel").getByText("1").first()).toBeVisible({
      timeout: 60_000,
    });

    // Break the query through the editor.
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.getByRole("tabpanel").locator(".view-lines").first();
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.type(
      "```sql broken\nSELECT * FROM this_table_does_not_exist\n```\n\n<DataTable data={broken}/>\n"
    );

    // The document stays up and the failure is named where the table would be.
    await expect(
      page.getByRole("tabpanel").getByText(/does not exist|Catalog Error/i).first()
    ).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("inputs and sharing", () => {
  test.slow();

  test("a Dropdown input filters a query, Grafana-style", async ({ page }) => {
    await page.goto("/");
    await ensureProfile(page);
    await expect(page.getByText("Duck-UI").first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Dashboards", exact: true }).click();
    await page.getByPlaceholder("New dashboard name").fill("Filtered");
    await page.getByRole("button", { name: "New", exact: true }).click();

    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("hello").first()).toBeVisible({ timeout: 60_000 });

    // Author a document with an input wired into the SQL.
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = panel.locator(".view-lines").first();
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.type(
      [
        "<Dropdown name=region options='north,south' title='Region'/>",
        "",
        "```sql filtered",
        "SELECT * FROM (VALUES ('north', 111), ('south', 222)) AS t(region, amount)",
        "WHERE region = '${inputs.region.value}'",
        "```",
        "",
        "<DataTable data={filtered}/>",
        "",
        "<TimeSeries data={filtered} x=region y=amount/>",
      ].join("\n")
    );

    // Leave edit mode: in the split view the SOURCE pane also contains the
    // literal text "222", so assertions about the DOCUMENT belong in view mode.
    await page.getByRole("button", { name: "Done" }).click();

    // Default = first option: only north's row shows, and TimeSeries renders
    // as a real chart rather than an unknown-tag placeholder.
    await expect(panel.getByText("111").first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText("222")).toHaveCount(0);
    await expect(panel.getByText(/<TimeSeries/)).toHaveCount(0);

    // Switching the input re-runs the query with the new binding.
    await panel.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "south" }).click();
    await expect(panel.getByText("222").first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText("111")).toHaveCount(0);
  });

  test("a viewer link opens read-only; an editable copy is one click", async ({ browser }) => {
    const authorContext = await browser.newContext();
    const readerContext = await browser.newContext();

    try {
      const author = await authorContext.newPage();
      await author.goto("/");
      await ensureProfile(author);
      await expect(author.getByText("Duck-UI").first()).toBeVisible({ timeout: 60_000 });

      await author.getByRole("button", { name: "Dashboards", exact: true }).click();
      await author.getByPlaceholder("New dashboard name").fill("Public report");
      await author.getByRole("button", { name: "New", exact: true }).click();
      await expect(author.getByRole("tabpanel").getByText("42").first()).toBeVisible({
        timeout: 60_000,
      });

      await author.getByRole("button", { name: "Share", exact: true }).click();
      const viewerInput = author.getByRole("dialog").locator("input[readonly]").first();
      await expect(viewerInput).not.toHaveValue("…", { timeout: 30_000 });
      const viewerUrl = await viewerInput.inputValue();
      expect(viewerUrl).toContain("#dash=");

      // ---- Recipient opens the link -------------------------------------
      const reader = await readerContext.newPage();
      await reader.goto(viewerUrl.slice(viewerUrl.indexOf("/#")));
      await ensureProfile(reader);

      const confirm = reader.getByRole("dialog");
      await expect(confirm.getByText(/Open .Public report./)).toBeVisible({ timeout: 30_000 });
      await expect(confirm.getByText(/read-only/)).toBeVisible();
      await confirm.getByRole("button", { name: "Open", exact: true }).click();

      // The document runs on the READER's engine and renders.
      const panel = reader.getByRole("tabpanel");
      await expect(panel.getByText("42").first()).toBeVisible({ timeout: 60_000 });

      // Read-only: no Edit, but the honest path to editing is offered.
      await expect(reader.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
      await expect(
        reader.getByRole("button", { name: "Save editable copy" })
      ).toBeVisible();
    } finally {
      await authorContext.close();
      await readerContext.close();
    }
  });
});
