// Optional real-UI preview driven by ownership.integration.mjs; all API writes
// reach that runner's disposable schema. No running directory service is used.
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

export async function runOwnershipPreview({
  apiBase,
  staffCookie,
  recipientCookie,
  entryId,
  recipientUsername,
}) {
  const artifacts = await mkdtemp(path.join(tmpdir(), "ownership-preview-"));
  const vite = await createServer({
    configFile: false,
    plugins: [react({ exclude: /node_modules|vite-cache/ })],
    cacheDir: path.join(artifacts, "vite-cache"),
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": {
          target: new URL(apiBase).origin,
          // The ephemeral preview represents the configured application origin.
          headers: { origin: "http://localhost:4350" },
        },
      },
    },
  });
  let browser;
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
      headless: true,
    });
    const pageErrors = [];
    async function open(cookie, url) {
      const context = await browser.newContext({
        viewport: { width: 1360, height: 1050 },
      });
      const split = cookie.indexOf("=");
      await context.addCookies([
        {
          name: cookie.slice(0, split),
          value: cookie.slice(split + 1),
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(origin + url);
      return page;
    }
    const staff = await open(staffCookie, `/listings/${entryId}/edit`);
    await expect(staff.getByLabel(/^Current password/)).toHaveCount(0);
    const reason = staff.getByLabel("Reason for change", { exact: false });
    const save = staff.getByRole("button", { name: "Save entry", exact: true });
    await expect(save).toBeDisabled();
    await reason.fill("Reviewed the fictional fixture entry details");
    await expect(save).toBeEnabled();
    const formOrder = await reason.evaluate((el) =>
      Boolean(
        el.compareDocumentPosition(
          document.querySelector('button[aria-label="Save entry"]'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
    assert.equal(formOrder, true);
    await save.click();
    await expect(
      staff.getByText("Entry updated.", { exact: false }),
    ).toBeVisible();
    await staff
      .getByRole("button", { name: "Assign owner", exact: true })
      .click();
    const dialog = staff.getByRole("dialog", { name: "Assign owner" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Current password/)).toHaveCount(0);
    const selectRecipient = async () => {
      await staff
        .getByRole("combobox", { name: "Select account" })
        .fill(recipientUsername);
      await staff
        .getByRole("option", { name: recipientUsername, exact: true })
        .click();
    };
    await selectRecipient();
    await staff
      .getByLabel("Reason for ownership assignment")
      .fill("Recipient agreed to maintain this fictional local group entry.");
    const propose = staff.getByRole("button", {
      name: "Propose ownership",
      exact: true,
    });
    await expect(propose).toHaveText("");
    await expect(propose).toBeEnabled();
    await staff.getByLabel("Reason for ownership assignment").press("Tab");
    await expect(propose).toBeFocused();
    await expect(
      staff.getByRole("tooltip", { name: "Propose ownership" }),
    ).toBeVisible();
    await propose.press("Enter");
    await expect(
      staff.getByText(
        "Assignment proposed. Ownership changes only after acceptance.",
      ),
    ).toBeVisible();
    await staff
      .getByRole("button", { name: "Cancel assignment", exact: true })
      .click();
    await expect(
      staff.getByText("Assignment cancelled. Ownership has not changed."),
    ).toBeVisible();
    // The optional alias grants no account permissions and is private.
    await staff.getByRole("radio", { name: "No account", exact: true }).check();
    await staff
      .getByLabel("Manager alias (optional, private)")
      .fill("Fictional manager");
    await staff
      .getByLabel("Reason for ownership assignment")
      .fill("Test staff-maintained manager without an account");
    staff.once("dialog", async (prompt) => prompt.accept());
    await staff.getByRole("button", { name: "Save no-account owner" }).click();
    await expect(
      staff.getByText("No-account ownership saved.", { exact: false }),
    ).toBeVisible();
    await staff.setViewportSize({ width: 390, height: 844 });
    await dialog.screenshot({
      path: path.join(artifacts, "staff-no-account-mobile.png"),
    });
    assert.equal(
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await staff.setViewportSize({ width: 1360, height: 1050 });
    await staff
      .getByRole("radio", { name: "Porcupine account", exact: true })
      .check();
    await selectRecipient();
    await staff
      .getByLabel("Reason for ownership assignment")
      .fill("New consent invitation after testing cancellation.");
    await staff
      .getByRole("button", { name: "Propose ownership", exact: true })
      .click();
    await expect(
      staff.getByRole("button", { name: "Cancel assignment", exact: true }),
    ).toBeVisible();
    await dialog.screenshot({
      path: path.join(artifacts, "staff-nomination.png"),
    });

    const recipient = await open(recipientCookie, "/account/assignments");
    await expect(
      recipient.getByRole("heading", {
        name: "Ownership assignments",
        exact: true,
      }),
    ).toBeVisible();
    const accept = recipient.getByRole("button", {
      name: "Accept ownership",
      exact: true,
    });
    await expect(accept).toBeDisabled();
    await expect(
      recipient.getByRole("button", {
        name: "Decline assignment",
        exact: true,
      }),
    ).toHaveText("");
    await expect(
      recipient.getByText("fixture.editor", { exact: false }),
    ).toHaveCount(0);
    await expect(
      recipient.getByText("fixture.owner", { exact: false }),
    ).toHaveCount(0);
    const before = await recipient.request.get(
      origin + `/api/listings/${entryId}/permissions`,
    );
    assert.equal((await before.json()).canEdit, false);
    await recipient.setViewportSize({ width: 390, height: 844 });
    await recipient.screenshot({
      path: path.join(artifacts, "recipient-pending-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await recipient.setViewportSize({ width: 1360, height: 1050 });
    await expect(recipient.getByLabel(/^Current password/)).toHaveCount(0);
    await expect(accept).toBeDisabled(); // A signed-in session is not consent.
    await recipient
      .getByRole("checkbox", {
        name: "I agree to maintain Concord Makers Exchange",
      })
      .check();
    await expect(accept).toBeEnabled();
    await recipient
      .getByRole("checkbox", {
        name: "I agree to maintain Concord Makers Exchange",
      })
      .press("Tab");
    await expect(accept).toBeFocused();
    await expect(
      recipient.getByRole("tooltip", { name: "Accept ownership" }),
    ).toBeVisible();
    await recipient.screenshot({
      path: path.join(artifacts, "recipient-consent-desktop.png"),
      fullPage: true,
    });
    await accept.press("Enter");
    await expect(
      recipient.getByText("Ownership accepted.", { exact: false }),
    ).toBeVisible();
    await expect(accept).toHaveCount(0);
    const after = await recipient.request.get(
      origin + `/api/listings/${entryId}/permissions`,
    );
    assert.equal((await after.json()).canEdit, true);
    await recipient.goto(origin + `/listings/${entryId}/edit`);
    await expect(
      recipient.getByLabel("Reason for change", { exact: false }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("button", { name: "Assign owner", exact: true }),
    ).toHaveCount(0);
    await expect(recipient.getByLabel(/^Current password/)).toHaveCount(0);
    await recipient.screenshot({
      path: path.join(artifacts, "recipient-accepted-desktop.png"),
      fullPage: true,
    });
    assert.deepEqual(pageErrors, []);
    console.log(
      `Ownership browser passed: session-only editing, bottom reason, account picker, no-account manager, nomination/cancellation, private inbox, mobile layout and explicit acceptance. Preview screenshots: ${artifacts}`,
    );
  } finally {
    if (browser) await browser.close();
    await vite.close();
  }
}
