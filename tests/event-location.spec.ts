import { test, expect } from "@playwright/test";

test("event locations are map searches on list and detail without loading Google", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/events")).json();
  const event = {
    ...data.items[0],
    venue: "Café & Hall",
    address: "10 Main St",
    city: "Concord",
    state: "NH",
    postalCode: "03301",
    country: "USA",
    locationType: "physical",
  };
  await page.route("**/api/events?**", (route) =>
    route.fulfill({ json: { ...data, items: [event], total: 1 } }),
  );
  await page.route(`**/api/events/${event.id}`, (route) =>
    route.fulfill({ json: event }),
  );
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4350"))
      external.push(request.url());
  });
  for (const path of ["/events", `/events/${event.id}`]) {
    await page.goto(path);
    const link = page.getByRole("link", { name: /^Search Google Maps for/ });
    await expect(link).toBeVisible();
    const url = new URL((await link.getAttribute("href"))!);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "Café & Hall, 10 Main St, Concord, NH, 03301, USA",
    );
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test("missing and virtual event locations do not offer maps", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/events")).json();
  const event = {
    ...data.items[0],
    venue: null,
    city: null,
    address: null,
    state: null,
    postalCode: null,
    country: null,
    locationType: "unknown",
  };
  await page.route(`**/api/events/${event.id}`, (route) =>
    route.fulfill({ json: event }),
  );
  for (const venue of [null, "Online via Zoom"]) {
    event.venue = venue;
    await page.goto(`/events/${event.id}`);
    await expect(
      page.getByText(venue ?? "Check the source for location details.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Search Google Maps for/ }),
    ).toHaveCount(0);
  }
});

test("unknown access does not add a confirmation icon to entry surfaces", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings?pageSize=12")).json();
  data.items = ["group", "channel", "business", "resource", "organization"].map(
    (kind, i) => ({
      ...data.items[i],
      kind,
      accessMode: "unknown",
      selfConfirmedAt: null,
      editorReviewedAt: null,
    }),
  );
  data.total = data.items.length;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  for (const path of ["/directory", "/directory?view=table"]) {
    await page.goto(path);
    await expect(
      page.getByRole("img", { name: "Unconfirmed", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Access not confirmed", { exact: true }),
    ).toHaveCount(0);
  }
  const listing = data.items[0];
  await page.route(`**/api/listings/${listing.id}`, (route) =>
    route.fulfill({ json: listing }),
  );
  await page.goto(`/listings/${listing.id}`);
  await expect(
    page.getByRole("img", { name: "Unconfirmed", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Access not confirmed", { exact: true }),
  ).toHaveCount(0);
});
