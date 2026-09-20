import { test, expect } from "@playwright/test";

test("touch long-press reveals the topic name without requiring icon recognition", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:4350",
  });
  try {
    const page = await context.newPage();
    await page.goto("/directory?q=Independence%20Inn");
    const link = page
      .getByRole("article")
      .getByRole("link", { name: "Filter by topic: Housing", exact: true })
      .first();
    await link.scrollIntoViewIfNeeded();
    const box = (await link.boundingBox())!;
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(
      page.getByRole("tooltip", { name: "Housing", exact: true }),
    ).toBeVisible();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await context.close();
  }
});

test("cards show every topic as a named icon with keyboard tooltip and shared filter link", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings")).json();
  data.items = [
    {
      ...data.items[0],
      kind: "channel",
      accessMode: "unknown",
      tags: ["Housing", "Learning", "Signal", "Arts", "Unmapped topic"],
    },
  ];
  data.total = 1;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/directory");
  const card = page.getByRole("article");
  const topics = card.getByRole("group", { name: "Topics" });
  await expect(topics.getByRole("link")).toHaveCount(5);
  for (const name of ["Housing", "Learning", "Unmapped topic"]) {
    await expect(
      topics
        .getByRole("link", { name: "Filter by topic: " + name, exact: true })
        .locator("svg"),
    ).toBeVisible();
  }
  const housing = topics.getByRole("link", {
    name: "Filter by topic: Housing",
    exact: true,
  });
  await expect(housing).toHaveText("");
  await housing.focus();
  await expect(
    page.getByRole("tooltip", { name: "Housing", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Access not confirmed", { exact: true }),
  ).toHaveCount(0);
  await expect(card.getByTestId("card-confirmation")).toBeVisible();
  await expect(card.locator(".MuiTypography-overline")).toHaveCount(0);
  await housing.click();
  await expect(page).toHaveURL(/\/directory\?tag=Housing$/);
  await page.reload();
  await expect(page).toHaveURL(/tag=Housing/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tag of await topics.getByRole("link").all()) {
    const box = (await tag.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("topic search options and detail chips retain names alongside icons", async ({
  page,
}) => {
  await page.goto("/directory");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Tags", exact: true })
    .fill("Housing");
  const option = page.getByRole("option", { name: "Housing", exact: true });
  await expect(option.locator("svg")).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/tags=[a-f0-9-]+/);
  await page.goto("/listings/4d099ca1-23da-4313-a091-08d5d4fc2fa3");
  const housing = page
    .getByRole("group", { name: "Topics" })
    .getByRole("link", { name: "Housing", exact: true });
  await expect(housing).toHaveText("Housing");
  await expect(housing.locator("svg")).toBeVisible();
});

test("researched classifications and shortened Signal links appear in their correct sections", async ({
  page,
  request,
}) => {
  for (const [id, kind] of [
    ["4d099ca1-23da-4313-a091-08d5d4fc2fa3", "Businesses"],
    ["2ea81405-a48e-4454-8773-fec993ef0a4b", "Resources"],
    ["6b06283d-fec2-4907-9ce3-d49f22689b1e", "Organizations"],
  ]) {
    await page.goto("/listings/" + id);
    await expect(page.getByTestId("entry-status")).not.toContainText(kind);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Explore");
    await expect(
      page.getByRole("heading", { name: "Additional sources", exact: true }),
    ).toBeVisible();
  }
  for (const name of [
    "Liberty Debate Planning",
    "Monday Manumissions",
    "NoChat:Freecoast Events",
  ]) {
    const query = "connection=signal&q=" + encodeURIComponent(name);
    const data = await (await request.get("/api/listings?" + query)).json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].kind).toBe("channel");
    await page.goto("/directory?" + query);
    await expect(
      page.getByRole("article").getByRole("link", { name: /^Signal ·/ }),
    ).toHaveAttribute("href", /^https:\/\/tinyurl\.com\//);
    await expect(
      page
        .getByRole("article")
        .getByText("Access not confirmed", { exact: true }),
    ).toHaveCount(0);
  }
});
