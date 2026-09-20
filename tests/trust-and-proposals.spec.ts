import { test, expect } from "@playwright/test";
test("restricted groups have a top-row lock without implying a private listing", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings?pageSize=12")).json();
  data.items = ["invite_only", "private", "open", "unknown"].map(
    (accessMode, index) => ({ ...data.items[index], accessMode }),
  );
  data.total = 4;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/directory");
  const cards = page.getByRole("article");
  const lock = cards
    .nth(0)
    .getByTestId("card-title-actions")
    .getByRole("img", { name: "Invite only", exact: true });
  await expect(lock).toBeVisible();
  const cardSave = cards.nth(0).getByRole("button", { name: /^Save / });
  const lockBounds = (await lock.boundingBox())!;
  const saveBounds = (await cardSave.boundingBox())!;
  expect(lockBounds.x).toBeLessThan(saveBounds.x);
  expect(
    Math.abs(
      lockBounds.y +
        lockBounds.height / 2 -
        saveBounds.y -
        saveBounds.height / 2,
    ),
  ).toBeLessThan(2);
  await expect(
    cards.nth(0).getByRole("img", { name: "Invite only", exact: true }),
  ).toHaveCount(1);
  await lock.focus();
  await expect(
    page.getByRole("tooltip", { name: /^Invite only/ }),
  ).toContainText("instructions are public");
  await expect(
    cards
      .nth(1)
      .getByTestId("card-title-actions")
      .getByRole("img", { name: "Private group", exact: true }),
  ).toBeVisible();
  for (const index of [2, 3])
    await expect(
      cards
        .nth(index)
        .getByRole("img", { name: /^(Invite only|Private group)$/ }),
    ).toHaveCount(0);
  await page.goto("/directory?view=table");
  await expect(
    page
      .getByTestId("entry-status")
      .first()
      .getByRole("img", { name: "Invite only", exact: true }),
  ).toBeVisible();
});
test("invitation instructions encourage external requests and explain public retention", async ({
  page,
}) => {
  await page.goto("/submit");
  await page.getByRole("combobox", { name: "Access", exact: true }).click();
  await page.getByRole("option", { name: "Invite only", exact: true }).click();
  const instructions = page.getByRole("textbox", {
    name: "How to request an invitation (public)",
    exact: true,
  });
  await expect(instructions).toBeVisible();
  await expect(
    page.getByText("This listing and its invitation instructions are public.", {
      exact: false,
    }),
  ).toContainText("Changes are retained in revision history");
  await expect(
    page.getByText("No personal contact details are required", {
      exact: false,
    }),
  ).toBeVisible();
  await instructions.fill("Use the group-managed request form in Connections.");
  await page.getByRole("combobox", { name: "Access", exact: true }).click();
  await page.getByRole("option", { name: "Private", exact: true }).click();
  await expect(instructions).toHaveValue(
    "Use the group-managed request form in Connections.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("confirmation appears in the card footer without a type label, with focus tooltips", async ({
  page,
}) => {
  await page.goto("/directory");
  const card = page.getByRole("article").first();
  const status = card.getByTestId("card-confirmation");
  const badge = status.getByRole("img", { name: "Unconfirmed", exact: true });
  await expect(badge).toBeVisible();
  await badge.focus();
  await expect(
    page.getByRole("tooltip", { name: /Unconfirmed/ }),
  ).toBeVisible();
  await expect(card.locator(".MuiTypography-overline")).toHaveCount(0);
  const icon = (await badge.boundingBox())!;
  const title = (await card.getByRole("heading").boundingBox())!;
  const bounds = (await card.boundingBox())!;
  expect(icon.x).toBeGreaterThan(bounds.x + bounds.width / 2);
  expect(icon.y).toBeGreaterThan(title.y + title.height);
});
test("dated checks become recheck badges and explain their dates", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings?pageSize=12")).json();
  const recent = new Date(Date.now() - 86400000).toISOString();
  const old = new Date(Date.now() - 181 * 86400000).toISOString();
  data.items = [
    { ...data.items[0], selfConfirmedAt: recent, editorReviewedAt: old },
  ];
  data.total = 1;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/directory");
  const card = page.getByRole("article").first();
  await card.getByRole("img", { name: "Self-confirmed", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText("New Hampshire time");
  await card
    .getByRole("img", { name: "Editor review needs rechecking", exact: true })
    .focus();
  await expect(
    page.getByRole("tooltip", { name: /^Editor-reviewed on/ }),
  ).toContainText("180 days");
});
test("missing joining details are not automatically ideas; filter URLs round-trip", async ({
  page,
}) => {
  await page.goto("/directory?needs=joining_details");
  const card = page.getByRole("article").first();
  await expect(
    card.getByRole("img", { name: "Joining details missing", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("img", { name: "Idea / proposed", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Sort", exact: true }),
  ).toHaveText("Confirmation first");
  await page
    .getByRole("combobox", { name: "Community stage", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Idea / proposed", exact: true })
    .click();
  await expect(page).toHaveURL(/lifecycle=proposed/);
  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Community stage", exact: true }),
  ).toHaveText("Idea / proposed");
});
test("proposal form needs intent but no invented link and distinguishes an organizer", async ({
  page,
}) => {
  await page.goto("/submit");
  await page
    .getByRole("combobox", { name: "Community stage", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Idea / proposed", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Seeking an organizer", exact: true })
    .check();
  await expect(
    page.getByText("This flag does not assign an account owner", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Connection 1 URL")).toHaveCount(0);
});
test("FSP is an enriched organization, preserving its stable URL and source attribution", async ({
  page,
}) => {
  await page.goto("/listings/2a193762-5ece-478d-80f3-3a9e58421212");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Free State Project",
  );
  await expect(page.getByTestId("entry-status")).not.toContainText(
    "Organizations",
  );
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Explore");
  await expect(
    page.getByRole("heading", { name: "Public contact", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "+1-603-263-0308", exact: true }),
  ).toHaveAttribute("href", "tel:+16032630308");
  await expect(
    page.getByRole("link", { name: /^Discord · Community Discord invitation/ }),
  ).toHaveAttribute("href", /discord\.com\/invite\//);
  await expect(
    page.getByRole("heading", { name: "Additional sources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Unconfirmed", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("sources page discloses sorting and the limits of verification", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(
    page.getByRole("heading", {
      name: "Sources, ranking & privacy",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("180 days", { exact: false })).toBeVisible();
  await expect(
    page.getByText("not proof of independence", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("There are no member-attestation votes", { exact: false }),
  ).toBeVisible();
});
