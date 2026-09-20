import { test, expect } from "@playwright/test";

test("public pages have one icon-only copy action in the breadcrumb action group", async ({
  page,
  request,
}) => {
  const listing = (await (await request.get("/api/listings")).json()).items[0];
  const event = (await (await request.get("/api/events")).json()).items[0];
  const paths = [
    "/",
    "/directory",
    "/groups",
    "/channels",
    "/businesses",
    "/resources",
    "/events",
    "/events/calendar",
    "/events/add",
    "/submit",
    "/about",
    "/listings/" + listing.id,
    "/events/" + event.id,
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of paths) {
      await page.goto(path);
      const copy = page.getByRole("button", { name: "Copy link", exact: true });
      await expect(copy).toHaveCount(1);
      await expect(copy).toBeVisible();
      await expect(copy).toHaveText("");
      await expect(copy.locator("svg")).toHaveCount(1);
      const toolbar = page.getByTestId("page-toolbar");
      await expect(
        toolbar.getByRole("button", { name: "Copy link" }),
      ).toBeVisible();
      const row = (await toolbar.boundingBox())!,
        actions = (await page.getByTestId("page-actions").boundingBox())!,
        button = (await copy.boundingBox())!;
      const crumb = (await page
        .getByRole("navigation", { name: "Breadcrumb" })
        .boundingBox())!;
      expect(
        Math.abs(row.x + row.width - actions.x - actions.width),
      ).toBeLessThan(2);
      expect(button.x).toBeGreaterThanOrEqual(crumb.x + crumb.width);
      expect(button.y).toBeGreaterThanOrEqual(row.y);
      expect(button.y + button.height).toBeLessThanOrEqual(
        row.y + row.height + 1,
      );
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("icon actions have tooltips, keyboard activation and current view feedback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/directory?q=Signal&pageSize=24");
  const copy = page.getByRole("button", { name: "Copy link", exact: true });
  await copy.focus();
  await expect(page.getByRole("tooltip", { name: "Copy link" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(page.url());
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/q=Signal/);
  // Router URL updates can precede the filter/toolbar render commit.
  await expect(
    page.getByRole("textbox", { name: "Search entries", exact: true }),
  ).toHaveValue("");
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(page.url());
  await page.goto("/events");
  await expect(
    page.getByRole("link", { name: "Upcoming list", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const calendar = page.getByRole("link", {
    name: "Month calendar",
    exact: true,
  });
  await expect(calendar).toHaveText("");
  await calendar.hover();
  await expect(
    page.getByRole("tooltip", { name: "Month calendar" }),
  ).toBeVisible();
  await calendar.click();
  await expect(
    page.getByRole("link", { name: "Month calendar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Previous month" })).toHaveText(
    "",
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: "test-results/icon-actions-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/icon-actions-mobile.png",
    fullPage: true,
  });
});
