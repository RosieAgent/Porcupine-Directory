import { test, expect } from "@playwright/test";

test("filter controls expand beside the results count and preserve applied URL state when closed", async ({
  page,
}) => {
  await page.goto("/directory?tag=Signal&sort=recent&page=2");
  const toolbar = page.getByTestId("directory-results-toolbar");
  const toggle = toolbar.getByRole("button", { name: "Filters", exact: true });
  await expect(toolbar.getByRole("status")).toContainText(/\d+ entries found/);
  const pageSize = page.getByRole("combobox", {
    name: "Results per page",
  });
  await expect(pageSize).toHaveText("25");
  await pageSize.click();
  await expect(page.getByRole("option")).toHaveText(["25", "50", "100"]);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-description", "2 active filters");
  await expect(
    page.getByRole("textbox", { name: "Search entries" }),
  ).toHaveCount(0);
  const count = (await toolbar.getByRole("status").boundingBox())!,
    button = (await toggle.boundingBox())!;
  expect(button.x).toBeGreaterThan(count.x + count.width);
  expect(button.x - count.x - count.width).toBeLessThan(16);
  const initial = page.url();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const region = page.getByRole("region", { name: "Directory filters" });
  await expect(region).toBeVisible();
  for (const label of ["Access", "Tags", "Location", "Sort"])
    await expect(
      region.getByRole("combobox", { name: label, exact: true }),
    ).toBeVisible();
  await expect(region.getByText("Signal", { exact: true })).toBeVisible();
  await expect(
    region.getByRole("combobox", { name: "Sort", exact: true }),
  ).toHaveText("Recently updated");
  await toggle.click();
  await expect(region).toHaveCount(0);
  expect(page.url()).toBe(initial);
  await toggle.click();
  await region.getByRole("combobox", { name: "Sort", exact: true }).click();
  await page.getByRole("option", { name: "Name A–Z" }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(toggle).toHaveAttribute("aria-description", "2 active filters");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(region.getByText("Signal", { exact: true })).toBeVisible();
  await region.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/tag=Signal/);
  await expect(toggle).toHaveAttribute(
    "aria-description",
    "Search and filter entries",
  );
  await expect(page.getByRole("article")).toHaveCount(25);
  await toggle.click();
  await expect(region).toHaveCount(0);
  await page.screenshot({ path: "test-results/filters-collapsed.png" });
});

test("section filters work on mobile without a type selector or horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/groups");
  const toggle = page.getByRole("button", { name: "Filters", exact: true });
  await toggle.click();
  const region = page.getByRole("region", { name: "Directory filters" });
  await expect(region).toBeVisible();
  await expect(
    region.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveCount(0);
  await region
    .getByRole("textbox", { name: "Search entries" })
    .fill("zz-no-matching-entry-zz");
  await region.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("directory-results-toolbar")).toContainText(
    "0 entries found",
  );
  await toggle.click();
  await expect(region).toHaveCount(0);
  await expect(toggle).toBeVisible();
  await toggle.click();
  await region.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/filters-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
