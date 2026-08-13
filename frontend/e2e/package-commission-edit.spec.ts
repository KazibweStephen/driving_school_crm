import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Package commission edit pre-fill', () => {
  test('commission values render inline and pre-fill the edit stepper', async ({ page }) => {
    await loginSuperAdmin(page);

    // Create a fixture product + package + commission rate via API.
    const token = await page.evaluate(() => localStorage.getItem('access_token') || '');
    const ts = Date.now();
    const fixture = await page.evaluate(async ({ token, ts }) => {
      const productRes = await fetch('/api/v1/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `CommProduct-${ts}`, price: 0 }),
      });
      const product = await productRes.json();

      const pkgRes = await fetch('/api/v1/packages/with-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: product.id,
          name: `CommPackage-${ts}`,
          price: 500000,
          rate_total_amount: 25000,
          rate_converter_pct: 50,
          rate_primary_recommender_pct: 30,
          rate_secondary_recommender_pct: 20,
          rate_active_from: new Date().toISOString().split('T')[0],
        }),
      });
      const pkg = await pkgRes.json();
      return { productName: product.name, packageName: pkg.name };
    }, { token, ts });

    await page.goto('/products');
    await expect(page).toHaveURL(/\/products/, { timeout: 10000 });

    // Find the fixture product row and expand it
    const productRow = page.locator('p-table .p-datatable-tbody > tr', {
      hasText: fixture.productName,
    }).first();
    await expect(productRow).toBeVisible({ timeout: 10000 });
    await productRow.locator('button').first().click();

    // Wait for the expanded packages table
    const packagesTable = page.locator('p-table').nth(1);
    await expect(packagesTable).toBeVisible({ timeout: 5000 });

    // Verify commission is shown inline for the fixture package
    const packageRow = packagesTable.locator('tbody tr', { hasText: fixture.packageName }).first();
    await expect(packageRow).toBeVisible({ timeout: 5000 });
    await expect(packageRow.locator('td').nth(4)).toContainText('25,000', { timeout: 5000 });
    await expect(packageRow.locator('td').nth(4)).toContainText('50.00/30.00/20.00%');

    // Open the edit package dialog
    await packageRow.locator('button').first().click();
    await expect(page.getByText('Edit Package', { exact: true })).toBeVisible({ timeout: 5000 });

    // Move to the Commission step
    await page.getByRole('button', { name: 'Next: Commission Rate' }).click();
    await expect(page.getByText('Split Percentages')).toBeVisible({ timeout: 5000 });

    // Verify the commission inputs are pre-filled
    const inputs = page.locator('p-inputnumber input');
    await expect(inputs.nth(0)).toBeVisible({ timeout: 5000 });
    await expect(inputs.nth(0)).toHaveValue(/25000|25,000/);
    await expect(inputs.nth(1)).toHaveValue('50');
    await expect(inputs.nth(2)).toHaveValue('30');
    await expect(inputs.nth(3)).toHaveValue('20');
  });
});
