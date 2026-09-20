import { test, expect } from "@playwright/test";

test("tag-first discovery combines filters, survives reload and preserves old links", async ({
  page,
  request,
  browser,
}) => {
  const catalog = await (await request.get("/api/tags")).json();
  const business = catalog.items.find(
    (t: { name: string }) => t.name === "Business",
  );
  const tech = catalog.items.find((t: { name: string }) => t.name === "Tech");
  await page.goto("/directory");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const tags = page.getByRole("combobox", { name: "Tags", exact: true });
  for (const name of ["Business", "Tech"]) {
    await tags.fill(name);
    await page.getByRole("option", { name, exact: true }).click();
  }
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/tags=/);
  expect(
    new Set(new URL(page.url()).searchParams.get("tags")!.split(",")),
  ).toEqual(new Set([business.id, tech.id]));
  await expect(
    page.getByRole("link", {
      name: "AI Automation & Business Technology",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", {
      name: "AI Automation & Business Technology",
      exact: true,
    }),
  ).toBeVisible();
  const other = await browser.newPage();
  await other.goto(page.url());
  await expect(
    other.getByRole("link", {
      name: "AI Automation & Business Technology",
      exact: true,
    }),
  ).toBeVisible();
  await other.close();
  const old = await (await request.get("/api/listings?tag=business")).json();
  const modern = await (
    await request.get("/api/listings?tags=" + business.id)
  ).json();
  expect(old.total).toBe(modern.total);
  await page.goto("/tags");
  await page.getByLabel("Search tags", { exact: true }).fill("Tech");
  await expect(
    page.getByRole("link", { name: "Tech", exact: true }),
  ).toHaveAttribute("href", "/directory?tags=" + tech.id);
});

test("contributors select existing tags and cannot access editor tools", async ({
  page,
  request,
}) => {
  await page.goto("/submit");
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  const tags = page.getByRole("combobox", { name: "Topics", exact: true });
  await tags.fill("Invented tag should not be created");
  await tags.press("Enter");
  await expect(
    page
      .locator(".MuiChip-root")
      .filter({ hasText: "Invented tag should not be created" }),
  ).toHaveCount(0);
  await tags.fill("Business");
  await page.getByRole("option", { name: "Business", exact: true }).click();
  await expect(
    page.locator(".MuiChip-root").filter({ hasText: "Business" }),
  ).toBeVisible();
  for (const route of [
    "/editor/tags",
    "/editor/review",
    "/account/assignments",
  ]) {
    await page.goto(route);
    await expect(page.getByText(/Sign in/).first()).toBeVisible();
  }
  expect((await request.get("/api/moderation/queue")).status()).toBe(403);
  expect((await request.get("/api/ownership/inbox")).status()).toBe(401);
  expect((await request.get("/api/admin/event-sync")).status()).toBe(403);
});

test("anonymous issue dialog sends only approved fields and has a generic receipt", async ({
  page,
}) => {
  let posted: Record<string, unknown> | undefined;
  await page.route("**/api/moderation/reports", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        message:
          "Thank you. If this entry is available, your report will be reviewed.",
      },
    });
  });
  await page.goto("/listings/78964ddf-5800-4643-b6b3-559a8008abf0");
  await page
    .getByRole("button", { name: "Report an issue", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .locator('input[type="email"],input[type="password"]'),
  ).toHaveCount(0);
  // UI labels are checked separately from the server's bounded reason allowlist.
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect
    .poll(() => posted?.listingId)
    .toBe("78964ddf-5800-4643-b6b3-559a8008abf0");
  expect(posted).not.toHaveProperty("username");
  expect(posted).not.toHaveProperty("email");
});

test("public initial HTML has entry previews but private pages never leak metadata", async ({
  request,
}) => {
  const html = await (
    await request.get(
      "/listings/78964ddf-5800-4643-b6b3-559a8008abf0?token=NOT_FOR_SHARING",
    )
  ).text();
  expect(html).toContain('property="og:title"');
  expect(html).toContain("AI Automation");
  expect(html).not.toContain("NOT_FOR_SHARING");
  const privateResponse = await request.get(
    "/account/assignments?token=PRIVATE",
  );
  expect(privateResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(await privateResponse.text()).not.toContain("PRIVATE");
});
