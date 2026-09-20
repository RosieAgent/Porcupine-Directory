import { test, expect } from "@playwright/test";

test("Explore offers Browse tags without the three redundant shortcut pills", async ({
  page,
}) => {
  await page.goto("/directory");
  const shortcuts = page.locator('[aria-label="Directory shortcuts"]');
  await expect(shortcuts.getByRole("link")).toHaveCount(1);
  await expect(
    shortcuts.getByRole("link", { name: "Browse tags", exact: true }),
  ).toHaveAttribute("href", "/tags");
  for (const name of ["Businesses", "Nonprofits", "Signal connections"]) {
    await expect(
      shortcuts.getByRole("link", { name, exact: true }),
    ).toHaveCount(0);
  }
  await shortcuts.getByRole("link").click();
  await expect(page).toHaveURL(/\/tags$/);
});

test("table replaces Access with clickable tag icons without a confirmation badge", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings")).json();
  data.items = [
    {
      ...data.items[0],
      name: "A long community entry name for responsive layout",
      tags: ["Housing", "Learning", "Signal"],
      accessMode: "invite_only",
      selfConfirmedAt: null,
      editorReviewedAt: null,
    },
  ];
  data.total = 1;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/directory?view=table");
  const table = page.getByRole("table", { name: "Directory entries" });
  const row = table.getByRole("row").nth(1);
  await expect(
    table.getByRole("columnheader", { name: "Tags", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Access", exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const heading = row.getByTestId("table-entry-heading");
    const link = heading.getByRole("link", { name: data.items[0].name });
    await expect(link).toBeVisible();
    await expect(heading.getByRole("img")).toHaveCount(0);
    await expect(
      row.getByRole("img", { name: "Invite only", exact: true }),
    ).toBeVisible();
    const tags = row.getByRole("group", { name: "Topics" });
    await expect(tags).toHaveCount(1);
    await expect(tags.getByRole("link")).toHaveCount(3);
    const housing = tags.getByRole("link", {
      name: "Filter by topic: Housing",
      exact: true,
    });
    await expect(housing).toHaveAttribute("href", "/?tag=Housing");
    await housing.focus();
    await expect(
      page.getByRole("tooltip", { name: "Housing", exact: true }),
    ).toBeVisible();
    await housing.blur();
    await expect(
      page.getByRole("tooltip", { name: "Housing", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await row
    .getByRole("link", { name: "Filter by topic: Housing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/\?tag=Housing$/);
});

test("The Independents opens the series collection instead of one episode", async ({
  page,
  request,
}) => {
  const id = "99c0ed8b-6f88-4930-b4f4-00412321844f";
  const playlist =
    "https://www.youtube.com/playlist?list=PL6rnEwExHzQRW2TQbBpCn24n6q2fgcv89";
  const data = await (
    await request.get("/api/listings?q=The%20Independents")
  ).json();
  const entry = data.items.find((item: { id: string }) => item.id === id);
  expect(entry.url).toBe(playlist);
  expect(entry.summary).toContain("Carla Gericke");
  expect(entry.selfConfirmedAt).toBeNull();
  expect(entry.editorReviewedAt).toBeNull();
  expect(
    entry.connections.find(
      (link: { id: string }) =>
        link.id === "b1bde7ca-34ad-4711-ad81-26351e6b2b4a",
    ).placement,
  ).toBe("additional");
  await page.goto("/listings/" + id);
  const primary = page.locator('ul[aria-label="Connections"]');
  await expect(
    primary.getByRole("link", { name: /^YouTube · The Independents/ }),
  ).toHaveAttribute("href", playlist);
  await expect(primary.locator('a[href*="/watch?"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "The Independents — official episode archive",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Additional resources (1)" }).click();
  await expect(
    page.getByRole("link", { name: /^YouTube · Original imported episode/ }),
  ).toBeVisible();
});
