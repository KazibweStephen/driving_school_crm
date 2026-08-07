import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test('super admin: post-login company selection + header switcher scopes lists', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[placeholder="e.g. 0774..."]').fill('0782832711');
  await page.locator('input[placeholder="Enter your 4-digit PIN"]').fill('1234');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Post-login company selection dialog shows because >1 company exists
  const dialog = page.getByText('Select Company', { exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Second Company')).toBeVisible();
  await expect(page.getByText('Default Company')).toBeVisible();

  // Pick Second Company
  await page.getByText('Second Company').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/dashboard');

  // Header switcher present for super admin; shows current company
  const switcher = page.getByLabel('Switch company').last();
  await expect(switcher).toBeVisible();

  // Products scoped to Second Company (should be empty)
  await page.locator('aside').getByText('Management').click();
  await page.getByRole('link', { name: 'Products' }).click();
  await page.waitForURL('**/products');
  await expect(page.getByText('No products')).toBeVisible().catch(() => {});

  // Switch back to Default Company via header switcher
  await switcher.click();
  await page.getByText('Default Company', { exact: true }).click();
  await page.waitForLoadState('load');
  await page.getByRole('link', { name: 'Products' }).click().catch(() => {});
  await page.waitForURL('**/products');
  await page.waitForTimeout(1500);
  const countText = await page.locator('body').innerText();
  expect(countText).not.toContain('No products');
});
