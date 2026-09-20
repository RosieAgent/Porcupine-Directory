import { test, expect } from "@playwright/test";
const admin = {
  id: "9033fdd5-a089-479b-8d9d-9f6426040ac0",
  username: "private.admin",
  alias: "Anonymous",
  role: "administrator",
  privilegesSuspended: false,
  recoverySaved: true,
  strong: false,
  staffVerified: false,
  passkeyCount: 0,
};

test("administrator verifies a password without passkeys and sees only the admin user fields", async ({
  page,
}) => {
  let verified = false;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { ...admin, staffVerified: verified },
        passkeysEnabled: false,
        staffAuthMode: "password_recent",
        emailRecoveryEnabled: true,
        emailPreviewEnabled: true,
        submissionPolicy: "published",
      },
    }),
  );
  await page.route("**/api/account/saved", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route("**/api/admin/event-sync", (route) =>
    route.fulfill({
      json: {
        sources: [
          {
            sourceKey: "fsp_calendar",
            status: "partial",
            lastCheckedAt: "2026-09-19T00:00:00Z",
            lastFinishedAt: "2026-09-19T00:01:00Z",
            diagnosticsAt: "2026-09-19T00:01:00Z",
            skippedCount: 1,
            skipped: [
              {
                sourceEventId: "6147",
                code: "invalid_weekday",
                reason: "BYDAY=3S requires source correction.",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/admin/users?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: admin.id,
            username: "private.admin",
            role: "administrator",
            privilegesSuspended: false,
            recoverySaved: true,
            setupPending: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 24,
      },
    }),
  );
  await page.route("**/api/auth/reauthenticate", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      password: "test password entry",
    });
    verified = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Users", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Current password/).fill("test password entry");
  await page
    .getByRole("button", { name: "Verify password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Users", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Current password/)).toHaveValue("");
  await expect(page.locator("main")).not.toContainText(/passkey/i);
  await page
    .getByRole("button", { name: "private.admin administrator" })
    .click();
  await expect(page.getByLabel("Exact username")).toHaveValue("private.admin");
  await page
    .getByRole("button", { name: "fsp_calendar: partial · 1 skipped" })
    .click();
  await expect(
    page.getByText(/Event 6147: BYDAY=3S requires source correction/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("local recovery UI explains that preview mail is not external recovery", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: { ...admin, staffVerified: true },
        passkeysEnabled: false,
        staffAuthMode: "password_recent",
        emailRecoveryEnabled: true,
        emailPreviewEnabled: true,
        submissionPolicy: "published",
      },
    }),
  );
  await page.route("**/api/account/saved", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route("**/api/auth/email/status", (route) =>
    route.fulfill({ json: { verified: false, pending: false } }),
  );
  await page.goto("/account/security");
  await expect(
    page.getByText(/Local preview only: messages go to this machine/),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/passkey/i);
});
