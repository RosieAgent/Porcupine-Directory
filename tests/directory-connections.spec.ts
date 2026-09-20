import { test, expect } from "@playwright/test";
test("sign-in actions are icon-only in one horizontal row", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    const actions = [
      page.getByRole("button", { name: "Sign in", exact: true }),
      page.getByRole("link", { name: "Create account", exact: true }),
      page.getByRole("link", { name: "Recover account", exact: true }),
    ];
    const boxes = [];
    for (const action of actions) {
      await expect(action).toBeVisible();
      await expect(action).toHaveText("");
      boxes.push((await action.boundingBox())!);
    }
    for (let index = 1; index < boxes.length; index++) {
      expect(Math.abs(boxes[index].y - boxes[0].y)).toBeLessThan(2);
      expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
    }
    await actions[1].focus();
    await expect(
      page.getByRole("tooltip", { name: "Create account", exact: true }),
    ).toBeVisible();
  }
});
test("Signal table is shareable, keeps paging and shows direct safe links", async ({
  page,
  request,
}) => {
  const query = "connection=signal&view=table&page=2&pageSize=12";
  const data = await (await request.get("/api/listings?" + query)).json();
  expect(data.total).toBeGreaterThan(12);
  await page.goto("/directory?" + query);
  await expect(
    page.getByRole("table", { name: "Directory entries" }),
  ).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(data.items.length + 1);
  await expect(
    page.getByRole("button", { name: "Table view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const links = page
    .getByRole("table")
    .getByRole("link", { name: /^Signal ·/ });
  expect(await links.count()).toBeGreaterThan(0);
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(links.first()).toHaveAttribute("rel", "noreferrer");
  await links.first().focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("button", { name: "Card view", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(data.items.length);
  expect(new URL(page.url()).searchParams.get("page")).toBe("2");
  expect(new URL(page.url()).searchParams.get("connection")).toBe("signal");
  await page.goBack();
  await expect(page.getByRole("table")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const firstEntry = page.getByRole("rowheader").first();
  await expect(links.first()).toBeInViewport();
  await expect(
    firstEntry.getByRole("img", { name: "Unconfirmed", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Connection", exact: true }),
  ).toHaveText("Signal");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("view")).toBe("table");
  await page.getByRole("combobox", { name: "Connection", exact: true }).click();
  await page.getByRole("option", { name: "Signal", exact: true }).click();
  await expect(page).toHaveURL(/connection=signal/);
});
test("Free State Theatre exposes its Signal destination without losing its invite fragment", async ({
  page,
  request,
}) => {
  const data = await (
    await request.get("/api/listings?q=Free%20State%20Theatre")
  ).json();
  const entry = data.items.find(
    (item: { name: string }) => item.name === "Free State Theatre",
  );
  expect(entry).toBeTruthy();
  await page.goto(`/listings/${entry.id}`);
  const link = page.getByRole("link", { name: /^Signal · Free State Theatre/ });
  await expect(link).toHaveAttribute("href", entry.url);
  expect(new URL(entry.url).hash.length).toBeGreaterThan(1);
});
test("activation secrets are removed from browser URL and have no share action", async ({
  page,
}) => {
  const token = "a".repeat(43);
  await page.goto("/activate#token=" + token);
  await expect(page).toHaveURL(/\/activate$/);
  await expect(page.getByLabel("Setup code", { exact: false })).toHaveValue(
    token,
  );
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
});

test("table view keeps empty and unavailable states usable", async ({
  page,
}) => {
  await page.goto("/directory?view=table&q=no-such-entry-6e86f");
  await expect(
    page.getByText("No entries on this page.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Directory entries" }),
  ).toBeVisible();
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary directory outage" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Filters", exact: true }),
  ).toBeVisible();
});
