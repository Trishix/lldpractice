import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function fullPractice(page: Page) {
  await page.goto('/');
  const card = page.locator('article.problem').first();
  await card.getByRole('button', { name: 'Open setup' }).click();
  await card.getByRole('radio', { name: /Full practice/ }).check();
  await card.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('tab', { name: 'Design', exact: true })).toBeVisible();
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`bounded practice controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await fullPractice(page);
    for (const tab of ['Design', 'Scratchpad', 'MCQs']) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
      const footer = page.locator('.section-footer');
      await expect(footer).toBeVisible();
      const bounds = (await footer.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
    }
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Clear all local data' }).scrollIntoViewIfNeeded();
    const clear = (await page.getByRole('button', { name: 'Clear all local data' }).boundingBox())!;
    expect(clear.y).toBeGreaterThanOrEqual(60);
    expect(clear.y + clear.height).toBeLessThanOrEqual(viewport.height);
  });
}

test('requirement notes survive reload and can be removed', async ({ page }) => {
  await fullPractice(page);
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await page.getByRole('button', { name: 'Add requirement note' }).click();
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Clarify timeout behavior');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this browser' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('Clarify timeout behavior');
  await page.getByRole('button', { name: 'Remove note 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveCount(0);
});

test('scratchpad moves only deliberately and preserves text after reload', async ({ page }) => {
  await fullPractice(page);
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await page.getByRole('textbox', { name: 'Scratchpad note' }).fill('Board owns cells');
  const item = page.locator('.canvas-item');
  const before = await item.getAttribute('style');
  await page.mouse.move(500, 500);
  await page.mouse.move(600, 550);
  await expect(item).toHaveAttribute('style', before!);
  await page.getByRole('button', { name: 'Move canvas item' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(item).not.toHaveAttribute('style', before!);
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this browser' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await expect(page.getByRole('textbox', { name: 'Scratchpad note' })).toHaveValue('Board owns cells');
});

test('practice and settings have no automated WCAG A/AA violations', async ({ page }) => {
  await fullPractice(page);
  for (const tab of ['Design', 'Scratchpad', 'MCQs', 'Review']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations, tab).toEqual([]);
  }
  await page.goto('/settings');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('scratchpad connects objects, zooms, and undoes deletion', async ({ page }) => {
  await fullPractice(page);
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await page.getByRole('textbox', { name: 'Scratchpad note' }).fill('Game');
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await page.getByRole('textbox', { name: 'Box label' }).fill('Board');
  const noteBounds = (await page.getByRole('textbox', { name: 'Scratchpad note' }).boundingBox())!;
  const boxBounds = (await page.getByRole('textbox', { name: 'Box label' }).boundingBox())!;
  expect(boxBounds.x >= noteBounds.x + noteBounds.width || boxBounds.y >= noteBounds.y + noteBounds.height).toBe(true);
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await page.getByLabel('Connect from').selectOption({ label: 'Game' });
  await page.getByLabel('Connect to').selectOption({ label: 'Board' });
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  await expect(page.locator('.canvas-connector')).toHaveCount(1);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Canvas zoom')).toHaveText('75%');
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await expect(page.locator('.canvas-connector')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.canvas-connector')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.canvas-connector')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this browser' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await expect(page.locator('.canvas-connector')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Box label' })).toHaveValue('Board');
});

test('scratchpad offers a focused mobile canvas and returns to practice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fullPractice(page);
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await expect(page.getByRole('button', { name: 'Expand canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand canvas' }).click();
  expect((await page.locator('.scratchpad-studio').boundingBox())!.height).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'Return to practice' }).click();
  await expect(page.getByRole('button', { name: 'Continue to MCQs' })).toBeVisible();
});

test('canvas drag, resize, and pan respond to pointer input', async ({ page }) => {
  await fullPractice(page);
  await page.getByRole('tab', { name: 'Scratchpad' }).click();
  await page.getByRole('button', { name: 'Expand canvas' }).click();
  await page.getByRole('button', { name: 'Add to canvas' }).click();
  const item = page.locator('.canvas-item');
  const position = () => item.evaluate(el => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top), width: parseFloat((el as HTMLElement).style.width) }));
  const original = await position();
  const handle = (await page.getByRole('button', { name: 'Move canvas item' }).boundingBox())!;
  await page.mouse.move(handle.x + 40, handle.y + 15);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(position).toMatchObject({ x: original.x + 80, y: original.y + 30 });
  const resize = (await page.getByRole('button', { name: 'Resize canvas item' }).boundingBox())!;
  await page.mouse.move(resize.x + 10, resize.y + 10);
  await page.mouse.down();
  await page.mouse.move(resize.x + 60, resize.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(position).toMatchObject({ width: original.width + 50 });
  await page.getByRole('button', { name: 'Pan', exact: true }).click();
  const canvas = page.locator('.scratchpad-canvas');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 400, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 400, bounds.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
});
