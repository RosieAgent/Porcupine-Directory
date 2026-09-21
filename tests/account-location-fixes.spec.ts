import { test, expect } from "@playwright/test";

const user = {
  id: "9033fdd5-a089-479b-8d9d-9f6426040ac0",
  username: "private.test",
  alias: "Anonymous",
  role: "user",
  privilegesSuspended: false,
  recoverySaved: true,
  strong: false,
  passkeyCount: 0,
};
const session = {
  user,
  emailRecoveryEnabled: false,
  passkeysEnabled: false,
  submissionPolicy: "published",
};

test("v0.1 sign-in and account security hide all passkey UI", async ({
  page,
  request,
}) => {
  expect(
    (await (await request.get("/api/auth/session")).json()).passkeysEnabled,
  ).toBe(false);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /passkey/i })).toHaveCount(0);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/account/saved", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.goto("/account/security");
  await expect(
    page.getByRole("heading", { name: "Account security", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/passkey/i);
  await expect(page.getByRole("button", { name: /passkey/i })).toHaveCount(0);
  await expect(
    page.getByText("Optional email recovery is not configured", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel(/^New password/)).toBeVisible();
});

test("location picker searches NH towns, regions and statewide choices without free-text creation", async ({
  page,
}) => {
  await page.goto("/submit");
  await page
    .getByRole("radio", {
      name: /An existing community, business, organization or resource/,
    })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /^Community or group/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const location = page.getByRole("combobox", { name: "Town or region" });
  await location.fill("concord");
  await page.getByRole("option", { name: "Concord, NH", exact: true }).click();
  await expect(location).toHaveValue("Concord, NH");
  await location.fill("Concrodd");
  await expect(page.getByRole("option")).toHaveCount(0);
  await location.fill("Seacoast");
  await page.getByRole("option", { name: "Seacoast, NH", exact: true }).click();
  await location.fill("New Hampshire");
  await page
    .getByRole("option", { name: "New Hampshire", exact: true })
    .click();
  await expect(location).toHaveValue("New Hampshire");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("owned submission sends the displayed identity and shows a stale-session failure without success", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/account/saved", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test-csrf" } }),
  );
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/listings", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 409,
      json: { error: "Your sign-in changed. No entry was created." },
    });
  });
  await page.goto("/submit");
  await expect(
    page.getByText("Your account privately owns this entry", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("radio", {
      name: /An existing community, business, organization or resource/,
    })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /^Community or group/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Mocked stale session fixture");
  await page
    .getByRole("textbox", { name: "What is it?", exact: true })
    .fill("This mocked form never creates a real listing.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish entry", exact: true })
    .click();
  await expect(
    page.getByText("Your sign-in changed. No entry was created.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(submitted?.expectedAccountId).toBe(user.id);
  await expect(
    page.getByText("Mocked stale session fixture", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View entry" })).toHaveCount(0);
});
