import { test, expect } from "@playwright/test";

test("business website connections are readable links, not duplicate icon buttons", async ({
  page,
}) => {
  for (const path of [
    "/businesses?q=soho",
    "/businesses?q=soho&view=table",
    "/listings/4a71b339-ef01-489b-99a2-1163bb5f9548",
  ]) {
    await page.goto(path);
    const link = page.locator(
      'ul[aria-label="Connections"] a[href="https://sohonh.com/"]',
    );
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText("sohonh.com");
    await expect(link).not.toHaveClass(/MuiIconButton/);
    await expect(
      page.locator('ul[aria-label="Connections"] a[href="http://sohonh.com/"]'),
    ).toHaveCount(0);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    await link.focus();
    await expect(
      page.getByRole("tooltip", { name: /https:\/\/sohonh.com\// }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});

test("same-domain resources and distinct invitation fragments remain separate", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/listings")).json();
  data.items = [
    {
      ...data.items[0],
      connections: [
        {
          id: crypto.randomUUID(),
          type: "website",
          url: "https://example.org/",
          label: "Website",
        },
        {
          id: crypto.randomUUID(),
          type: "website",
          url: "https://example.org/contact",
          label: "Contact",
          placement: "additional",
        },
        {
          id: crypto.randomUUID(),
          type: "signal",
          url: "https://signal.group/#first",
          label: "Main chat",
        },
        {
          id: crypto.randomUUID(),
          type: "signal",
          url: "https://signal.group/#second",
          label: "Events chat",
        },
      ],
    },
  ];
  data.total = 1;
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/directory");
  await expect(page.locator('ul[aria-label="Connections"] a')).toHaveCount(2);
  await page.getByRole("button", { name: "Additional resources (2)" }).click();
  await expect(
    page.getByRole("link", { name: /^Website · Contact/ }),
  ).toHaveAttribute("href", "https://example.org/contact");
  await expect(
    page.getByRole("link", { name: /^Signal · Events chat/ }),
  ).toHaveAttribute("href", "https://signal.group/#second");
});

test("NHLA has a sourced organization profile without implying calendar sync or confirmation", async ({
  page,
}) => {
  await page.goto("/listings/7bc76637-93bc-43a7-918f-1dd2f288f9bf");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "NH Liberty Alliance (NHLA)",
  );
  await expect(page.getByTestId("entry-status")).not.toContainText(
    "Organizations",
  );
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Explore");
  await expect(page.locator('ul[aria-label="Connections"] a')).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: /^Website · Official website/ }),
  ).toHaveAttribute("href", "https://www.nhliberty.org/");
  await expect(
    page.getByRole("link", { name: /^Website · NHLA events and calendar/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Facebook ·/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Additional resources (1)" }).click();
  await expect(page.getByRole("link", { name: /^Facebook ·/ })).toHaveCount(2);
  await expect(
    page.getByRole("img", { name: "Unconfirmed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("its events are not automatically synchronized", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Additional sources", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("Barbell is a sourced Business with compact primary links and external signup", async ({
  page,
}) => {
  await page.goto("/listings/9cc7ad4d-a739-4847-85b4-383f8102a04c");
  await expect(page.getByTestId("entry-status")).not.toContainText(
    "Businesses",
  );
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Explore");
  await expect(page.locator('ul[aria-label="Connections"] a')).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: /^Website · Official gym website/ }),
  ).toHaveAttribute("href", "https://fsbb.club/");
  await expect(
    page.getByText("270 Amory St, Unit 3", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Additional resources (1)" }).click();
  await expect(
    page.getByRole("link", { name: /^Website · Membership signup/ }),
  ).toHaveAttribute("href", /guru\.gyminsight\.com/);
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
