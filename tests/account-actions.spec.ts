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
const session = (signedIn = false) => ({
  user: signedIn ? user : null,
  emailRecoveryEnabled: true,
  submissionPolicy: "published",
});

for (const flow of [
  "register",
  "activate",
  "recover-phrase",
  "recover-email",
  "replace",
]) {
  test(`${flow} requires matching passwords without sending the confirmation`, async ({
    page,
  }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: session(flow === "replace") }),
    );
    await page.route("**/api/account/saved", (route) =>
      route.fulfill({ json: { ids: [] } }),
    );
    await page.route("**/api/auth/email/status", (route) =>
      route.fulfill({ json: { verified: false, pending: false } }),
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ json: { token: "test-csrf" } }),
    );
    const endpoint =
      flow === "register"
        ? "signup"
        : flow === "activate"
          ? "activate"
          : flow === "replace"
            ? "security/reset"
            : flow === "recover-email"
              ? "email/recover"
              : "recover";
    const requests: Record<string, unknown>[] = [];
    await page.route(`**/api/auth/${endpoint}`, async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 400,
        json: { error: "Test request received; no account changed." },
      });
    });
    await page.goto(
      flow === "replace"
        ? "/account/security"
        : flow.startsWith("recover")
          ? "/recover"
          : `/${flow}`,
    );
    if (flow === "activate")
      await page
        .getByLabel("Setup code", { exact: false })
        .fill("a".repeat(43));
    if (flow === "register" || flow.startsWith("recover"))
      await page.getByLabel("Username", { exact: false }).fill("private.test");
    if (flow === "recover-email") {
      await page.getByRole("combobox", { name: "Recovery method" }).click();
      await page.getByRole("option", { name: "Verified email" }).click();
      await page
        .getByLabel("Email recovery code", { exact: false })
        .fill("test-code");
    } else if (flow === "recover-phrase")
      await page
        .getByLabel("Recovery phrase", { exact: false })
        .fill("test recovery phrase");
    const password = page.getByLabel(
      flow === "register" ? /^Password/ : /^New password/,
    );
    const confirm = page.getByLabel(/^Confirm password/);
    const value = "A long test password !@#";
    await password.fill(value);
    await expect(confirm).toHaveAttribute("autocomplete", "new-password");
    await confirm.fill(value + "x");
    const submit = page.getByRole("button", {
      name:
        flow === "register"
          ? "Create a private account"
          : flow === "activate"
            ? "Activate account"
            : flow === "replace"
              ? "Replace password and recovery phrase"
              : "Recover your account",
      exact: true,
    });
    await submit.click();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("alert").filter({ hasText: "Passwords do not match" }),
    ).toBeVisible();
    expect(requests).toHaveLength(0);
    await confirm.fill(value);
    await expect(confirm).toHaveAttribute("aria-invalid", "false");
    await submit.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].password).toBe(value);
    expect(requests[0]).not.toHaveProperty("confirmation");
    expect(requests[0]).not.toHaveProperty("passwordConfirmation");
    await password.fill(value + "changed");
    await submit.click();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(1);
  });
}

test("header account actions show state and retain sign-out on failure", async ({
  page,
}) => {
  let signedIn = true;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: session(signedIn) }),
  );
  await page.route("**/api/account/saved", (route) =>
    route.fulfill({ json: { ids: [] } }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test-csrf" } }),
  );
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/directory");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("group", { name: "Signed in", exact: true }),
  ).toBeVisible();
  await header.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not complete sign-out",
  );
  await expect(
    header.getByRole("link", { name: "Your account", exact: true }),
  ).toBeVisible();
  await page.route("**/api/auth/logout", (route) => {
    signedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await header.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    header.getByRole("group", { name: "Signed out", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Your account", exact: true }),
  ).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByLabel(/^Confirm password/)).toHaveCount(0);
});
