import { test, expect } from "@playwright/test";

test("requested topic merges preserve old shared filters and retire unwanted choices", async ({
  page,
  request,
}) => {
  for (const [old, canonical, oldId] of [
    [
      "Accelerating Migration",
      "Migration",
      "b524c2b6-0e82-4cb3-84f4-92fb02c7f9d8",
    ],
    ["IRL - Quill", "IRL", "5b9095af-a190-421e-86d0-73227c9f6c45"],
  ]) {
    const previous = await (
      await request.get(
        "/api/listings?tag=" + encodeURIComponent(old) + "&pageSize=48",
      )
    ).json();
    const current = await (
      await request.get(
        "/api/listings?tag=" + encodeURIComponent(canonical) + "&pageSize=48",
      )
    ).json();
    expect(previous.total).toBe(current.total);
    const oldIdResult = await (
      await request.get(`/api/listings?tags=${oldId}&pageSize=48`)
    ).json();
    expect(oldIdResult.total).toBe(current.total);
    expect(oldIdResult.items.map((item: { id: string }) => item.id)).toEqual(
      current.items.map((item: { id: string }) => item.id),
    );
    expect(previous.total).toBeGreaterThan(0);
    expect(previous.items.map((item: { id: string }) => item.id)).toEqual(
      current.items.map((item: { id: string }) => item.id),
    );
    expect(
      previous.items.every(
        (item: { tags: string[] }) =>
          !item.tags.includes(old) && item.tags.includes(canonical),
      ),
    ).toBe(true);
  }
  await page.goto("/tags");
  for (const name of [
    "Membership",
    "local and state teams",
    "Accelerating Migration",
    "IRL - Quill",
  ]) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  const arts = await (
    await request.get("/api/listings/bf799c15-6975-4e33-aeb1-7defea10fe86")
  ).json();
  expect(arts.tags).toEqual(["Skills", "Arts", "IRL"]);
});

test("You Are The Power has sourced nonprofit and volunteer information without granting confirmation", async ({
  page,
  request,
}) => {
  const id = "05587d94-51bd-4531-8a8b-d71d387a9497";
  const entry = await (await request.get("/api/listings/" + id)).json();
  expect(entry.tags).toEqual(
    expect.arrayContaining(["Nonprofit", "Volunteer", "Activism", "Website"]),
  );
  expect(entry.tags).not.toContain("local and state teams");
  expect(entry.tags).not.toContain("Slack");
  expect(entry.description).toContain("501(c)(3)");
  expect(
    entry.referenceSources.some(
      (source: { url: string }) =>
        source.url === "https://www.youarethepower.net/about/",
    ),
  ).toBe(true);
  expect(entry.editorReviewedAt).toBeNull();
  expect(entry.selfConfirmedAt).toBeNull();
  await page.goto("/listings/" + id);
  await expect(
    page.locator(
      'ul[aria-label="Connections"] a[href="https://www.youarethepower.net/"]',
    ),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Nonprofit", exact: true }),
  ).toBeVisible();
});

test("Rooted Free has a homepage, Henniker location and explicit free-membership requirements", async ({
  page,
  request,
}) => {
  const id = "969f2bc3-9000-4e7d-bf69-344853543e27";
  const entry = await (await request.get("/api/listings/" + id)).json();
  expect(entry.url).toBe("https://www.rootedfree.com/");
  expect(entry.location).toBe("Henniker, NH");
  expect(entry.accessMode).toBe("private");
  expect(entry.missingJoiningDetails).toBe(false);
  expect(entry.accessInstructions).toContain("Membership is free and required");
  expect(entry.tags).not.toContain("Membership");
  expect(entry.tags).not.toContain("Signal");
  expect(entry.tags).toEqual(
    expect.arrayContaining([
      "Learning",
      "Skills",
      "Arts",
      "IRL",
      "Website",
      "Facebook",
      "Telegram",
    ]),
  );
  expect(entry.selfConfirmedAt).toBeNull();
  expect(entry.editorReviewedAt).toBeNull();
  await page.goto("/listings/" + id);
  await expect(
    page.locator(
      'ul[aria-label="Connections"] a[href="https://www.rootedfree.com/"]',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /^Telegram · Telegram invitation linked by Rooted Free/,
    }),
  ).toHaveAttribute("href", "https://t.me/+JcV8cYy3yBhiYmUx");
  await expect(
    page.getByText(entry.accessInstructions, { exact: true }),
  ).toBeVisible();
  await page.goto("/directory?q=Rooted%20Free");
  await expect(
    page
      .getByRole("article")
      .getByRole("img", { name: "Private group", exact: true }),
  ).toBeVisible();
});
