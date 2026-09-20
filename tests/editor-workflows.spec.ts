import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
async function staffFixture(page: Page) {
  // Intercept all API requests: these UI fixtures never write to real entries.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          user: {
            id,
            username: "fixture.editor",
            alias: "Anonymous",
            role: "editor",
            privilegesSuspended: false,
            recoverySaved: true,
            strong: false,
            staffVerified: true,
            passkeyCount: 0,
          },
          passkeysEnabled: false,
          staffAuthMode: "password_recent",
          emailRecoveryEnabled: false,
          submissionPolicy: "published",
        },
      });
    if (path === "/api/auth/csrf")
      return route.fulfill({ json: { token: "fixture-token" } });
    if (path === "/api/account/saved")
      return route.fulfill({ json: { ids: [] } });
    return route.fulfill({
      status: 404,
      json: { error: "No fixture for this request." },
    });
  });
}

test("staff catalog hides retired location tags unless explicitly requested", async ({
  page,
}) => {
  await staffFixture(page);
  await page.route("**/api/tags", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id,
            name: "Manchester",
            icon: "place",
            aliases: [],
            retired: true,
            mergedInto: null,
            version: 2,
            count: 0,
          },
        ],
      },
    }),
  );
  await page.goto("/editor/tags");
  await expect(
    page.getByRole("link", { name: "Manchester", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Show retired tags", exact: true })
    .check();
  await expect(
    page.getByRole("link", { name: "Manchester", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Show retired tags", exact: true })
    .uncheck();
  await expect(
    page.getByRole("link", { name: "Manchester", exact: true }),
  ).toHaveCount(0);
});

test("staff catalog form saves controlled names, bundled icons and aliases on mobile", async ({
  page,
}) => {
  await staffFixture(page);
  let tag = {
    id,
    name: "Learning",
    icon: "book",
    aliases: [] as string[],
    retired: false,
    mergedInto: null,
    version: 1,
    count: 3,
  };
  await page.route("**/api/tags", (route) =>
    route.fulfill({ json: { items: [tag] } }),
  );
  await page.route(`**/api/tags/${id}`, async (route) => {
    const data = route.request().postDataJSON();
    expect(route.request().method()).toBe("PUT");
    expect(data).toMatchObject({
      name: "Education",
      icon: "book",
      aliases: ["Learning resources"],
      version: 1,
      reason: "Clarify the topic label",
    });
    tag = {
      ...tag,
      ...data,
      aliases: [...data.aliases, "Learning"],
      version: 2,
    };
    await route.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/tags");
  await page
    .getByRole("button", { name: "Edit tag: Learning", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Tag name", exact: true })
    .fill("Education");
  await page
    .getByLabel("Aliases (one per line)", { exact: true })
    .fill("Learning resources");
  await page
    .getByRole("textbox", { name: "Reason for catalog change", exact: true })
    .fill("Clarify the topic label");
  await page.getByRole("button", { name: "Save tag", exact: true }).click();
  await expect(
    page.getByText("Catalog updated. Existing shared tag links remain usable."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Education", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-tags-mobile.png",
    fullPage: true,
  });
});

test("staff review queue resolves private reports without editing or confirming the entry", async ({
  page,
}) => {
  await staffFixture(page);
  let resolved = false;
  await page.route("**/api/moderation/queue?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id,
            name: "Fixture community",
            kind: "entry",
            status: "published",
            version: 4,
            unconfirmed: true,
            missing: false,
            stale: false,
            reported: !resolved,
            pending: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 24,
      },
    }),
  );
  await page.route(`**/api/moderation/entries/${id}/reports?**`, (route) =>
    route.fulfill({
      json: {
        listing: { id, name: "Fixture community", version: 4 },
        items: resolved
          ? []
          : [
              {
                id,
                reason: "broken_link",
                text: "The public link no longer opens.",
                status: "open",
                version: 1,
                createdAt: "2026-09-19T00:00:00Z",
                resolvedAt: null,
                resolution: "",
              },
            ],
        total: resolved ? 0 : 1,
        page: 1,
        pageSize: 12,
      },
    }),
  );
  await page.route(`**/api/moderation/reports/${id}/resolve`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      version: 1,
      listingVersion: 4,
      outcome: "resolved",
      resolution: "Checked the public destination.",
    });
    resolved = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/review");
  await page
    .getByRole("combobox", { name: "Review filter", exact: true })
    .click();
  await page.getByRole("option", { name: "Open reports", exact: true }).click();
  await expect(page).toHaveURL(/filter=reported/);
  await page
    .getByRole("button", {
      name: "Review reports for Fixture community",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("The public link no longer opens."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Private resolution note", exact: true })
    .fill("Checked the public destination.");
  await page
    .getByRole("button", { name: "Save report resolution", exact: true })
    .click();
  await expect(page.getByText("No reports match this status.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-review-mobile.png",
    fullPage: true,
  });
});
