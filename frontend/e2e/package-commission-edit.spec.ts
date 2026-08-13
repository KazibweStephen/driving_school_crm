import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('Package commission edit pre-fill', () => {
  test('commission values render inline and pre-fill the edit stepper', async ({ page }) => {
    await loginSuperAdmin(page);
    await page.goto('/products');
    await expect(page).toHaveURL(/\/products/, { timeout: 10000 });

    // Wait for products table and expand the first product row
    const firstRow = page.locator('p-table .p-datatable-tbody > tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.locator('button').first().click();

    // Wait for the expanded packages table (second p-table on the page)
    const packagesTable = page.locator('p-table').nth(1);
    await expect(packagesTable).toBeVisible({ timeout: 5000 });

    // Verify commission is shown inline for the first package
    const firstPackageRow = packagesTable.locator('tbody tr').first();
    await expect(firstPackageRow).toBeVisible({ timeout: 5000 });
    await expect(firstPackageRow.locator('td').nth(4)).toContainText('5,000', { timeout: 5000 });
    await expect(firstPackageRow.locator('td').nth(4)).toContainText('50.00/25.00/25.00%');

    // Open the edit package dialog
    await firstPackageRow.locator('button').first().click();
    await expect(page.getByText('Edit Package', { exact: true })).toBeVisible({ timeout: 5000 });

    // Move to the Commission step
    await page.getByRole('button', { name: 'Next: Commission Rate' }).click();
    await expect(page.getByText('Split Percentages')).toBeVisible({ timeout: 5000 });

    // Verify the commission inputs are pre-filled
    const inputs = page.locator('p-inputnumber input');
    await expect(inputs.nth(0)).toBeVisible({ timeout: 5000 });
    await expect(inputs.nth(0)).toHaveValue(/5000|5,000/);
    await expect(inputs.nth(1)).toHaveValue('50');
    await expect(inputs.nth(2)).toHaveValue('25');
    await expect(inputs.nth(3)).toHaveValue('25');
  });
});
