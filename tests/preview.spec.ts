import { test, expect } from "@playwright/test";

test("home sections lead to shareable listing pages in two clicks", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4350"))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find your people. Find your way in.",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Signal connections/ })
    .click();
  await expect(page).toHaveURL(/\/directory\?connection=signal$/);
  const first = page
    .getByRole("article")
    .first()
    .getByRole("heading")
    .getByRole("link");
  await expect(first).toBeVisible();
  const title = await first.textContent();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
  await expect(
    page.getByRole("heading", {
      name: /^How to (participate|request an invitation)$/,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  );
  const fresh = await context.browser()!.newContext();
  const recipient = await fresh.newPage();
  await recipient.goto("http://127.0.0.1:4350" + href);
  await expect(recipient.getByRole("heading", { level: 1 })).toHaveText(title!);
  await fresh.close();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("search, paging, sort and filters survive refresh and browser history", async ({
  page,
}) => {
  await page.goto("/directory?page=2&pageSize=12&sort=name");
  await expect(page.getByRole("article")).toHaveCount(12);
  const before = await page
    .getByRole("article")
    .first()
    .getByRole("heading")
    .textContent();
  await page.getByRole("link", { name: "Go to page 3", exact: true }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect(
    page.getByRole("article").first().getByRole("heading"),
  ).not.toHaveText(before!);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole("article").first().getByRole("heading"),
  ).toHaveText(before!);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search entries" })
    .fill("homeschool");
  await page
    .getByRole("button", { name: "Search", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/q=homeschool/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search entries" }),
  ).toHaveValue("homeschool");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Access", exact: true }).click();
  await page.getByRole("option", { name: "Invite only", exact: true }).click();
  await expect(page).toHaveURL(/access=invite_only/);
  await expect(page.getByRole("article").first()).toContainText("Invite only");
  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Access", exact: true }),
  ).toHaveText("Invite only");
  await page.goto("/directory?tag=Signal&sort=recent&pageSize=24");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Directory filters" })
      .getByText("Signal", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(24);
});

test("events have their own routes, filter URLs and direct-load detail pages", async ({
  page,
}) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Community events",
  );
  await expect(page.getByRole("article")).toHaveCount(12);
  const first = page
    .getByRole("article")
    .first()
    .getByRole("heading")
    .getByRole("link");
  const title = await first.textContent();
  await first.click();
  await expect(page).toHaveURL(/\/events\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "View original event" }),
  ).toBeVisible();
  await page.goto("/events?q=meet&from=2026-09-18&to=2026-12-17&pageSize=12");
  await expect(
    page.getByRole("textbox", { name: "Search events or venues" }),
  ).toHaveValue("meet");
  await expect(page.getByLabel("From date")).toHaveValue("2026-09-18");
});

test("bookmarks remain browser-local and storage survives reload", async ({
  page,
}) => {
  await page.goto("/directory");
  const first = page.getByRole("article").first();
  const title = await first.getByRole("heading").textContent();
  await first.getByRole("button", { name: /^Save / }).click();
  await page
    .getByRole("navigation", { name: "Sections", exact: true })
    .getByRole("link", { name: "Saved", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(title!);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: /^Unsave / }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("invalid paths and filters have useful states; clipboard fallback uses a dialog", async ({
  page,
  request,
}) => {
  await page.goto("/listings/not-a-uuid");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Listing unavailable",
  );
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Page not found",
  );
  await page.goto("/directory?page=-1");
  await expect(page.getByRole("alert")).toContainText("invalid filters");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Shareable URL")).toHaveValue(page.url());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const path of [
    "/api/listings?page=0",
    "/api/listings?pageSize=10000",
    "/api/events?from=invalid",
  ]) {
    expect((await request.get(path)).status()).toBe(400);
  }
  const missing = await request.get("/api/not-found");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("application/json");
  const payload = await (
    await request.get("/api/listings?page=2&pageSize=12")
  ).json();
  expect(payload.items).toHaveLength(12);
  expect(payload.total).toBeGreaterThan(24);
});

test("submission validates fields and unsafe links without collecting identity", async ({
  page,
  request,
}) => {
  await page.goto("/submit");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Example group");
  await page
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill("Meet local neighbors.");
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await page.getByLabel("Connection 1 URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByLabel("Connection 1 URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/listings", {
    headers: { "x-csrf-token": csrf.token },
    data: {
      kind: "group",
      name: "Example group",
      summary: "Meet local neighbors.",
      url: "javascript:alert(1)",
    },
  });
  expect(response.status()).toBe(400);
});

test("mobile navigation and filtered page fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Mobile sections" })
    .getByRole("link", { name: "Explore", exact: true })
    .click();
  await expect(page).toHaveURL(/\/directory$/);
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-routes.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/desktop-routes.png" });
});
