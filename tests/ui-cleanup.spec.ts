import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Fully mocked API: this suite can run against Vite without a database or writes.
test.use({ baseURL: process.env.UI_TEST_BASE_URL ?? "http://127.0.0.1:4350" });
const id = "11111111-1111-4111-8111-111111111111";
const listing = {
  id,
  kind: "group",
  name: "Neighbors and community gatherings",
  summary: "Meet neighbors around New Hampshire.",
  description: "A public description.",
  url: null,
  contactUrl: null,
  location: "Concord, NH",
  tags: ["Housing", "Learning", "Art", "Outdoor activities", "Unmapped topic"],
  accessMode: "invite_only",
  accessInstructions: "Ask the organizer for an invitation.",
  sourceName: "Community source",
  sourceUrl: "https://example.org/source",
  lastConfirmedAt: null,
  importedAt: null,
  links: [],
  connections: [],
  version: 1,
  status: "published",
  selfConfirmedAt: null,
  editorReviewedAt: null,
  lifecycle: "proposed",
  seekingOrganizer: true,
  missingJoiningDetails: true,
  publicPhone: "",
  publicEmail: "",
  publicAddress: "",
  openingHours: "",
  referenceSources: [
    {
      label: "Dated reference",
      url: "https://example.org/reference",
      checkedAt: "2026-09-01T12:00:00.000Z",
    },
  ],
};

async function fixtures(
  page: Page,
  options: { signedIn?: boolean; canEdit?: boolean; catalog?: boolean } = {},
) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === "/api/auth/session")
      data = {
        user: options.signedIn
          ? {
              id,
              username: "fixture",
              alias: "Fixture",
              role: "user",
              privilegesSuspended: false,
              recoverySaved: true,
              strong: false,
              staffVerified: false,
              passkeyCount: 0,
            }
          : null,
        emailRecoveryEnabled: false,
        submissionPolicy: "published",
      };
    else if (path === `/api/listings/${id}`) data = listing;
    else if (path === `/api/listings/${id}/permissions`)
      data = {
        canEdit: !!options.canEdit,
        canConfirm: false,
        canReview: false,
      };
    else if (path === "/api/account/saved") data = { ids: [] };
    else if (path === "/api/listings")
      data = { items: [listing], total: 1, page: 1, pageSize: 12 };
    else if (path === "/api/listings/facets")
      data = {
        tags: listing.tags,
        locations: [],
        kinds: [{ kind: "group", count: 1 }],
      };
    else if (path === "/api/tags" && options.catalog !== false)
      data = {
        items: [
          {
            id,
            name: "Housing",
            icon: "boat",
            aliases: ["Homes"],
            retired: false,
            mergedInto: null,
            version: 1,
            count: 1,
          },
        ],
      };
    else if (path === "/api/meta") data = { sources: [] };
    else {
      await route.fulfill({
        status: 404,
        json: { error: "Unavailable fixture" },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
}

for (const width of [1440, 390]) {
  test(`toolbar, source panel and chip spacing at ${width}px`, async ({
    page,
  }) => {
    await fixtures(page, { signedIn: true, canEdit: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/listings/${id}`);
    const actions = page.getByTestId("page-actions");
    await expect(
      actions.getByRole("button", { name: "Copy link" }),
    ).toBeVisible();
    await expect(actions.getByRole("button", { name: /^Save / })).toBeVisible();
    await expect(
      actions.getByRole("link", { name: "Edit entry" }),
    ).toHaveAttribute("href", `/listings/${id}/edit`);
    await expect(page.getByRole("button", { name: /^Save / })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Edit entry" })).toHaveCount(1);
    const toolbar = (await page.getByTestId("page-toolbar").boundingBox())!;
    const group = (await actions.boundingBox())!;
    expect(
      Math.abs(toolbar.x + toolbar.width - group.x - group.width),
    ).toBeLessThan(2);
    const crumb = (await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .boundingBox())!;
    expect(group.x).toBeGreaterThanOrEqual(crumb.x + crumb.width);
    const source = page.getByRole("region", { name: "Source information" });
    await expect(
      source.getByRole("link", { name: "Community source" }),
    ).toHaveAttribute("href", listing.sourceUrl);
    await expect(
      source.getByRole("link", { name: "Dated reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View original source" }),
    ).toHaveCount(0);
    const sectionHeadings = page.getByRole("heading", { level: 2 });
    await expect(sectionHeadings.nth(0)).toHaveText("About");
    await expect(sectionHeadings.nth(1)).toHaveText(
      "How to request an invitation",
    );
    await expect(
      page.getByText(/Not independently confirmed|Imported \d/, {
        exact: false,
      }),
    ).toHaveCount(0);
    const chip = page
      .getByRole("group", { name: "Topics" })
      .getByRole("link", { name: "Housing", exact: true });
    const bounds = (await chip.boundingBox())!;
    const icon = (await chip.locator("svg").boundingBox())!;
    const label = (await chip.locator(".MuiChip-label").boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(24);
    expect(icon.x - bounds.x).toBeGreaterThanOrEqual(4);
    expect(label.x).toBeGreaterThanOrEqual(icon.x + icon.width);
    expect(
      await chip
        .locator(".MuiChip-label")
        .evaluate((element) =>
          parseFloat(getComputedStyle(element).paddingLeft),
        ),
    ).toBeGreaterThanOrEqual(4);
    await expect(chip.locator('[data-tag-icon="boat"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test(`cards keep status semantics without confirmation badges at ${width}px`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/directory");
    const card = page.getByRole("article");
    await expect(card.locator(".MuiTypography-overline")).toHaveCount(0);
    for (const name of [
      "Invite only",
      "Idea / proposed",
      "Seeking an organizer",
      "Joining details missing",
    ]) {
      const indicator = card.getByRole("img", { name, exact: true });
      await expect(indicator).toHaveAttribute("tabindex", "0");
      await indicator.focus();
      await expect(
        page.getByRole("tooltip", { name: new RegExp(`^${name}`) }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("img", {
        name: /^(Unconfirmed|Self-confirmed|Editor-reviewed)/,
      }),
    ).toHaveCount(0);
    const bounds = (await card.boundingBox())!;
    const title = (await card.getByRole("heading").boundingBox())!;
    expect(title.y - bounds.y).toBeLessThan(32);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Edit is absent for anonymous visitors and denied accounts; catalog failures retain bundled icons", async ({
  page,
}) => {
  await fixtures(page, { catalog: false });
  await page.goto(`/listings/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    listing.name,
  );
  await expect(page.getByRole("link", { name: "Edit entry" })).toHaveCount(0);
  await expect(
    page
      .getByRole("group", { name: "Topics" })
      .getByRole("link", { name: "Housing", exact: true })
      .locator('[data-tag-icon="home"]'),
  ).toBeVisible();
  await page.unroute("**/api/**");
  await fixtures(page, { signedIn: true, canEdit: false });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    listing.name,
  );
  await expect(page.getByRole("link", { name: "Edit entry" })).toHaveCount(0);
});

test("share glyph copies filtered public URLs and the manual fallback never exposes tokens", async ({
  page,
  context,
}) => {
  await fixtures(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/listings/${id}?token=PRIVATE&next=/account#secret`);
  const copy = page.getByRole("button", { name: "Copy link", exact: true });
  await expect(copy.locator('[data-share-icon="true"]')).toBeVisible();
  await copy.focus();
  await expect(page.getByRole("tooltip", { name: "Copy link" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin;
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${origin}/listings/${id}`);
  await page.goto(
    `/directory?tag=Housing&tags=${id}&pageSize=24&token=PRIVATE#secret`,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    }),
  );
  await copy.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Shareable URL")).toHaveValue(
    `${origin}/directory?tag=Housing&tags=${id}&pageSize=24`,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const path of [
    "/saved",
    "/account",
    "/activate?token=PRIVATE",
    `/listings/${id}/edit`,
    `/listings/${id}/history`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy link", exact: true }),
    ).toHaveCount(0);
  }
});
