import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test.describe('Expense client attachment', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('web expense dialog attaches the selected client for a requires_client category', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.locator('h1')).toContainText('Expenses', { timeout: 10000 });

    await page.getByRole('button', { name: 'Add Expense' }).click();
    const dialog = page.locator('.p-dialog-mask');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select branch
    const branchSelect = dialog.locator('p-select').first().locator('[role="combobox"]').first();
    await branchSelect.click();
    await page.waitForTimeout(300);
    await page.locator('.p-select-option:has-text("Main Branch")').first().click();

    // Pick Permit Payment (requires_client) category
    const catSelect = dialog.locator('p-select').nth(1).locator('[role="combobox"]').first();
    await catSelect.click();
    await page.waitForTimeout(300);
    await page.locator('.p-select-option:has-text("Permit Payment")').first().click();

    // Set an amount
    const amountInput = dialog.locator('input[inputmode="decimal"]').first();
    await amountInput.fill('50000');

    // Client picker should appear
    await expect(page.getByPlaceholder('Search client by name or phone...')).toBeVisible({ timeout: 5000 });

    // Search a client
    await page.getByPlaceholder('Search client by name or phone...').fill('Kamonga');
    await page.waitForTimeout(600);
    const result = page.locator('ul li:has-text("Kamonga")').first();
    await expect(result).toBeVisible({ timeout: 5000 });
    await result.click();

    // The selected client label replaces the search results
    await expect(page.locator('ul li:has-text("Kamonga")')).toBeHidden({ timeout: 5000 });

    // Create button should now be enabled (client attached)
    const createBtn = dialog.getByRole('button', { name: 'Create' });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
  });
});
