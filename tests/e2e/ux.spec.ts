import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("catalogue has a named, focusable route heading and no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  const heading = page.locator("[data-route-heading]");
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("tabindex", "-1");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("client navigation moves focus to the destination heading", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.locator("[data-route-heading]")).toBeFocused();
});

test("catalogue shell visual contract stays stable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveScreenshot("catalogue-shell.png", { animations: "disabled" });
});

test("full practice uses requirement cards and a private canvas scratchpad", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article.problem").first();
  await card.getByRole("button", { name: "Open setup" }).click();
  await card.getByRole("radio", { name: /Full practice/ }).check();
  await card.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByRole("tab", { name: "Scratchpad" })).toBeVisible();
  await page.getByRole("tab", { name: "Scratchpad" }).click();
  await expect(page.getByRole("application", { name: "Scratchpad canvas" })).toBeVisible();
  await expect(page.getByText("Private · excluded from AI review")).toBeVisible();
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.getByRole("button", { name: "Add to canvas" }).click();
  await expect(page.getByRole("textbox", { name: "Scratchpad note" })).toBeVisible();
  await page.getByRole("tab", { name: "Design" }).click();
  await page.locator(".outline-links button").filter({ hasText: "Requirements" }).last().click();
  await expect(page.locator(".requirement-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add requirement note" })).toBeVisible();
});
