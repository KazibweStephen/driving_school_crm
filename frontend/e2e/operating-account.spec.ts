import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test.describe('Operating Account + Expected Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('operating page shows Post from Client Accounts and Owed / Reconcile dialogs', async ({ page }) => {
    await page.goto('/operating-account');
    await expect(page.locator('h1')).toContainText('Operating', { timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Post from Client Accounts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Owed / Reconcile' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fund Branch' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Post from Client Accounts' }).click();
    const postDialog = page.locator('.p-dialog-mask');
    await expect(postDialog).toBeVisible({ timeout: 5000 });
    await expect(postDialog.getByRole('button', { name: 'Post' })).toBeDisabled();
    await postDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(postDialog).toBeHidden({ timeout: 5000 });

    await page.getByRole('button', { name: 'Owed / Reconcile' }).click();
    const owedDialog = page.locator('.p-dialog-mask');
    await expect(owedDialog).toBeVisible({ timeout: 5000 });
    await expect(owedDialog.getByRole('button', { name: 'Reconcile' })).toBeDisabled();
    await owedDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(owedDialog).toBeHidden({ timeout: 5000 });
  });

  test('products page renders the Expected Expenses dialog', async ({ page }) => {
    await page.goto('/products');
    await expect(page.locator('h1')).toContainText('Products', { timeout: 10000 });

    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('td').first().locator('button').first().click();
    await expect(page.locator('body')).toContainText('Packages', { timeout: 5000 });

    const walletBtn = page.locator('button:has(.pi-wallet)').first();
    await expect(walletBtn).toBeVisible({ timeout: 5000 });
    await walletBtn.click();
    const dialog = page.locator('.p-dialog-mask');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Expected Expenses', { exact: false }).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add expense line' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
  });
});
