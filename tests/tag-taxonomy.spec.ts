import { test, expect } from "@playwright/test";
import {
  platformTagForConnection,
  linkedPlatformTags,
} from "../shared/platform-tags";

test("published platform labels match actual destination links", async ({
  request,
}) => {
  let seen = 0,
    total = 0;
  for (let page = 1; page === 1 || seen < total; page++) {
    const response = await request.get(
      `/api/listings?pageSize=48&page=${page}`,
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    total = data.total;
    for (const entry of data.items) {
      const platforms = new Set(
        entry.connections.map((c: { url: string; type?: string }) =>
          platformTagForConnection(c),
        ),
      );
      for (const name of linkedPlatformTags)
        expect(entry.tags.includes(name), entry.name + ": " + name).toBe(
          platforms.has(name),
        );
      for (const name of [
        "FB",
        "Businesses/Services",
        "20 Old Granite St",
        "Manchester",
        "Food, Farming, & Drink Discussion",
        "Both on facebook and Telegram more updates on Facebook",
        "in person",
        "InPerson",
        "Learning (Adult)",
        "Political Activism",
        "Political - Single Issue",
        "Web",
        "Internet",
        "website",
        "Free State Project Inc Teams",
      ])
        expect(entry.tags, entry.name).not.toContain(name);
    }
    expect(data.items.length).toBeGreaterThan(0);
    seen += data.items.length;
  }
  expect(seen).toBe(total);
});

test("IRL, Learning and independent political/volunteer topics replace legacy labels", async ({
  request,
  page,
}) => {
  const get = async (id: string) =>
    (await (await request.get("/api/listings/" + id)).json()).tags as string[];
  expect(await get("05587d94-51bd-4531-8a8b-d71d387a9497")).toEqual(
    expect.arrayContaining(["Politics", "Activism", "IRL", "Website"]),
  );
  expect(await get("fc2b46dc-5fb7-497f-8803-20419f9d513e")).toEqual(
    expect.arrayContaining(["Politics", "Single Issue"]),
  );
  expect(await get("27a0cd27-c3b0-4c35-b4bd-7bf797cd3661")).toContain(
    "Volunteer",
  );
  const learning = await get("1cff7e07-ddb8-47e2-935a-606a5e641fbf");
  expect(learning).toContain("Learning");
  expect(learning).not.toContain("18+");
  for (const [old, current] of [
    ["in person", "IRL"],
    ["InPerson", "IRL"],
    ["Learning (Adult)", "Learning"],
    ["Internet", "Website"],
    ["Web", "Website"],
    ["Political Activism", "Activism"],
    ["Political - Single Issue", "Single Issue"],
    ["Free State Project Inc Teams", "Volunteer"],
  ]) {
    const oldData = await (
      await request.get("/api/listings?tag=" + encodeURIComponent(old))
    ).json();
    const newData = await (
      await request.get("/api/listings?tag=" + encodeURIComponent(current))
    ).json();
    expect(oldData.total).toBe(newData.total);
  }
  await page.goto("/tags");
  await page
    .getByRole("textbox", { name: "Search tags", exact: true })
    .fill("Volunteer");
  await expect(
    page.getByRole("link", { name: "Volunteer", exact: true }),
  ).toBeVisible();
});

test("curated topic choices exclude retired labels and separate food from farming", async ({
  page,
  request,
}) => {
  await page.goto("/tags");
  const search = page.getByRole("textbox", {
    name: "Search tags",
    exact: true,
  });
  for (const label of [
    "FB",
    "Businesses/Services",
    "20 Old Granite St",
    "Manchester",
    "Both on facebook and Telegram more updates on Facebook",
  ]) {
    await search.fill(label);
    await expect(
      page.getByRole("link", { name: label, exact: true }),
    ).toHaveCount(0);
  }
  await search.fill("Food");
  await expect(
    page.getByRole("link", { name: "Food/Drink", exact: true }),
  ).toBeVisible();
  await search.fill("Farming");
  await page.getByRole("link", { name: "Farming", exact: true }).click();
  await expect(
    page.getByText("5 entries found", { exact: true }),
  ).toBeVisible();
  const recipes = await (
    await request.get("/api/listings/f90658f5-5960-4730-b457-cdfa5a9057eb")
  ).json();
  expect(recipes.tags).toContain("Food/Drink");
  expect(recipes.tags).not.toContain("Farming");
  const soho = await (
    await request.get("/api/listings/4a71b339-ef01-489b-99a2-1163bb5f9548")
  ).json();
  expect(soho.location).toBe("Manchester, NH");
  expect(soho.publicAddress).toContain("20 Old Granite St");
  const mama = await (
    await request.get("/api/listings/607f5c7e-fab1-487f-99d0-812ced47cde2")
  ).json();
  expect(mama.tags).toContain("Facebook");
  expect(mama.tags).not.toContain("Telegram");
  const power = await (
    await request.get("/api/listings/05587d94-51bd-4531-8a8b-d71d387a9497")
  ).json();
  expect(power.tags).not.toContain("Slack");
});
