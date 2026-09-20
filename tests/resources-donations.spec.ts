import { test, expect } from "@playwright/test";
const report = "f8d2630f-89af-4308-9117-9bc9a0ac9ccc";

test("resource cards retain confidence icons without redundant access text", async ({
  page,
}) => {
  await page.goto("/resources");
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .getByText("Access not confirmed", { exact: true }),
  ).toHaveCount(0);
});
test("report shows recent cached episodes and does not load external media", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4350"))
      external.push(request.url());
  });
  await page.route(`**/api/publications/${report}`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            title: "A recent public episode",
            url: "https://podcasters.spotify.com/pod/show/porcreport/episodes/test",
            publishedAt: "2026-09-16T23:00:01.000Z",
          },
        ],
        lastCheckedAt: "2026-09-19T01:00:00.000Z",
        lastSuccessfulAt: "2026-09-19T01:00:00.000Z",
        status: "ok",
        pollIntervalMinutes: 60,
      },
    }),
  );
  await page.goto(`/listings/${report}`);
  const panel = page.getByRole("region", { name: "Recent episodes" });
  await expect(
    panel.getByRole("link", { name: "A recent public episode" }),
  ).toBeVisible();
  await expect(panel.getByText(/Last checked/)).toBeVisible();
  await expect(
    panel.getByText(/does not currently change listing order/),
  ).toBeVisible();
  await expect(page.locator("iframe, video, audio")).toHaveCount(0);
  expect(external).toEqual([]);
});
test("failed checks show stale episodes honestly", async ({ page }) => {
  await page.route(`**/api/publications/${report}`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            title: "Saved episode",
            url: "https://anchor.fm/fixture",
            publishedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        lastCheckedAt: "2026-09-19T01:00:00.000Z",
        lastSuccessfulAt: "2026-01-02T00:00:00.000Z",
        status: "error",
        pollIntervalMinutes: 60,
      },
    }),
  );
  await page.goto(`/listings/${report}`);
  await expect(page.getByText(/The latest check failed/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved episode" })).toBeVisible();
});
test("donations work anonymously and fail closed until configured", async ({
  page,
}) => {
  await page.route("**/api/donations", (route) =>
    route.fulfill({ json: { bitcoin: null, lightning: null } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/donate");
  await expect(
    page.getByRole("heading", { name: "Support Porcupine Directory" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bitcoin address: TBD. Payments are disabled."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Not available yet. A receiving address has not been configured.",
    ),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Open .* wallet/ })).toHaveCount(
    0,
  );
  await expect(page.locator("input")).toHaveCount(1); // global directory search only
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByTestId("page-toolbar").getByRole("button"),
  ).toBeVisible();
});
test("configured public destinations have accessible copy and wallet actions", async ({
  page,
}) => {
  await page.route("**/api/donations", (route) =>
    route.fulfill({
      json: {
        bitcoin: { address: "fixture-address", uri: "bitcoin:fixture-address" },
        lightning: { address: "fixture@example.org", uri: "lightning:fixture" },
      },
    }),
  );
  await page.goto("/donate");
  await expect(
    page.getByRole("link", { name: "Open Bitcoin wallet" }),
  ).toHaveAttribute("href", "bitcoin:fixture-address");
  await expect(
    page.getByRole("button", { name: "Copy Lightning receiving address" }),
  ).toBeVisible();
});
