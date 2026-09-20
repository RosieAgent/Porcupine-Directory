import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";

test("hourly freshness distinguishes attempts from successful updates", async ({
  page,
  request,
}) => {
  const metadata = await (await request.get("/api/meta")).json();
  const source = metadata.sources.find(
    (s: { sourceKey: string }) => s.sourceKey === "fsp_calendar",
  );
  expect(source.pollIntervalMinutes).toBe(60);
  expect(source.lastCheckedAt).toBeTruthy();
  expect(source.lastSyncedAt).toBeTruthy();
  expect(
    new Date(source.nextPollAt).getTime() -
      new Date(source.lastCheckedAt).getTime(),
  ).toBe(3600000);
  await page.goto("/events");
  await expect(page.getByText(/Last checked:/)).toBeVisible();
  await expect(page.getByText(/Last updated:/)).toBeVisible();
  await expect(page.getByText(/Next check due around/)).toBeVisible();
  await page.getByRole("button", { name: "Next 7 days" }).click();
  expect(new URL(page.url()).searchParams.has("from")).toBe(true);
  expect(new URL(page.url()).searchParams.has("to")).toBe(true);
  await page.reload();
  await expect(page.getByLabel("From date")).not.toHaveValue("");
});

test("month grid loads all matching events with shareable search, navigation and detail links", async ({
  page,
  request,
  browser,
}) => {
  const first = (await (await request.get("/api/events")).json()).items[0];
  const month = DateTime.fromISO(first.startsAt)
    .setZone("America/New_York")
    .toFormat("yyyy-MM");
  const params = new URLSearchParams({ month, q: first.title });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/events/calendar?" + params);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Community calendar",
  );
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(month);
  const link = page.locator(`.fc-event[href="/events/${first.id}"]`).first();
  await expect(link).toBeVisible();
  await page.reload();
  await expect(link).toBeVisible();
  const recipient = await browser.newContext();
  const recipientPage = await recipient.newPage();
  await recipientPage.goto(page.url());
  await expect(recipientPage.getByLabel("Month", { exact: true })).toHaveValue(
    month,
  );
  await recipient.close();
  await page.getByRole("link", { name: "Next month", exact: true }).click();
  await expect(page.getByLabel("Month", { exact: true })).not.toHaveValue(
    month,
  );
  await page.goBack();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp("/events/" + first.id + "$"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(first.title);
  expect(errors).toEqual([]);
});

test("event contribution guide links to verified FSP services without collecting credentials", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("link", { name: "Add an event on FSP" }).click();
  await expect(page).toHaveURL(/\/events\/add$/);
  await expect(
    page.getByRole("link", { name: "Open FSP event form" }),
  ).toHaveAttribute("href", "https://community.fsp.org/calendar/submit-event/");
  await expect(
    page.getByRole("link", { name: "Request event-submission access" }),
  ).toHaveAttribute("href", "https://form-usa.keela.co/calendar-access");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Add your community event",
  );
});

test("failed checks keep cached events visible and clearly warn visitors", async ({
  page,
  request,
}) => {
  const metadata = await (await request.get("/api/meta")).json();
  metadata.sources = metadata.sources.map((source: { sourceKey: string }) =>
    source.sourceKey === "fsp_calendar"
      ? { ...source, status: "error" }
      : source,
  );
  await page.route("**/api/meta", (route) => route.fulfill({ json: metadata }));
  await page.goto("/events");
  await expect(page.getByText(/The latest check failed/)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("month calendar is usable on mobile and invalid months are rejected", async ({
  page,
  request,
}) => {
  expect(
    (await request.get("/api/events/calendar?month=2026-13")).status(),
  ).toBe(400);
  await page.goto("/events/calendar?month=invalid");
  await expect(page.getByText(/Invalid month or search/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("region", { name: "Monthly events calendar" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/calendar-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("region", { name: "Monthly events calendar" }),
  ).toBeVisible();
  // Popper tooltips and FullCalendar settle after the viewport resize event.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/calendar-mobile.png",
    fullPage: true,
  });
});
