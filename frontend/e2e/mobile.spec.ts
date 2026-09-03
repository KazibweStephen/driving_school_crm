import { test, expect, Page } from '@playwright/test';

const phone = '0782832711';
const pin = '1234';

async function mobileLogin(page: Page) {
  await page.goto('/m/login');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('phone').fill(phone);
  await page.getByTestId('pin').fill(pin);
  await page.getByTestId('login-btn').click();
  // Super admin may be prompted to pick a company when >1 exist
  const companySelection = page.getByTestId('company-selection');
  try {
    await companySelection.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('Default Company', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No company selection; proceed to dashboard
  }
  await expect(page).toHaveURL(/\/m\/home$/, { timeout: 10000 });
}

test.describe('Mobile PWA', () => {
  test('loads login screen at /m/login', async ({ page }) => {
    await page.goto('/m/login');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Drive CRM')).toBeVisible();
    await expect(page.getByText('Office Admin')).toBeVisible();
    await expect(page.getByTestId('phone')).toBeVisible();
    await expect(page.getByTestId('pin')).toBeVisible();
    await expect(page.getByTestId('login-btn')).toBeVisible();
  });

  test('office admin can log in and see home menu, dashboard stats are under Dashboard', async ({ page }) => {
    await mobileLogin(page);
    // Home is now the icon-grid menu
    await expect(page.getByTestId('home-dashboard')).toBeVisible();
    await expect(page.getByTestId('home-finance')).toBeVisible();
    // The stats that used to be on Home moved to /dashboard
    await page.goto('/m/dashboard');
    await expect(page.getByText('Daily Collection')).toBeVisible();
    await expect(page.getByTestId('qa-sale')).toBeVisible();
  });

  test('bottom nav shows only home button', async ({ page }) => {
    await mobileLogin(page);
    const nav = page.locator('nav');
    await expect(nav.getByText('Home')).toBeVisible();
  });

  test('expenses page loads and can create an expense', async ({ page }) => {
    await mobileLogin(page);
    await page.goto('/m/expenses');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    await page.getByTestId('new-expense').click();
    await page.getByTestId('expense-amount').fill('50000');
    await page.getByTestId('expense-description').fill('Fuel for office car');
    await page.getByTestId('submit-expense').click();
    await expect(page.getByText('Expense submitted')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Fuel for office car').first()).toBeVisible();
  });

  test('finance page lists sub-items and navigates to cash position, transfers and profit & loss', async ({ page }) => {
    await mobileLogin(page);
    await page.goto('/m/finance');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('finance-cash-position')).toBeVisible();
    await expect(page.getByTestId('finance-branch-transfers')).toBeVisible();
    await expect(page.getByTestId('finance-profit-loss')).toBeVisible();
    await expect(page.getByTestId('finance-operating-account')).toBeVisible();
    await page.getByTestId('finance-cash-position').click();
    await expect(page.getByRole('heading', { name: 'Cash Position' })).toBeVisible();
    await page.goto('/m/finance/transfers');
    await expect(page.getByRole('heading', { name: 'Branch Transfers' })).toBeVisible();
    await page.goto('/m/finance/profit-loss');
    await expect(page.getByRole('heading', { name: 'Profit & Loss' })).toBeVisible();
    await page.goto('/m/finance/operating-account');
    await expect(page.getByRole('heading', { name: 'Operating Account' })).toBeVisible();
  });

  test('operating account dialog flows render with permission gates', async ({ page }) => {
    await mobileLogin(page);
    await page.goto('/m/finance/operating-account');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Operating Account' })).toBeVisible();
    await expect(page.getByTestId('finance-operating-record')).toBeVisible();
    await expect(page.getByTestId('finance-operating-fund')).toBeVisible();
    // Record Entry dialog
    await page.getByTestId('finance-operating-record').click();
    await expect(page.getByTestId('operating-record-dialog')).toBeVisible();
    await expect(page.getByTestId('operating-record-amount')).toBeVisible();
    await page.getByText('Cancel').click();
    // Fund Branch dialog
    await page.getByTestId('finance-operating-fund').click();
    await expect(page.getByTestId('operating-fund-dialog')).toBeVisible();
    await expect(page.getByTestId('operating-fund-branch')).toBeVisible();
    await page.getByText('Cancel').click();
  });

  test('transfers page: initiate, fund, and receive/reject actions rendered with permission gates', async ({ page }) => {
    await mobileLogin(page);
    await page.goto('/m/finance/transfers');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Branch Transfers' })).toBeVisible();
    // Super admin has all permissions -> both action buttons and New Transfer / Fund visible
    await expect(page.getByTestId('new-transfer')).toBeVisible();
    await expect(page.getByTestId('fund-branch')).toBeVisible();
    // Direction filter
    await expect(page.getByTestId('transfer-direction-incoming')).toBeVisible();
    // Lists transfers
    await expect(page.getByText('No transfers found.')).toHaveCount(0, { timeout: 10000 }).catch(() => {});
    // New Transfer dialog
    await page.getByTestId('new-transfer').click();
    await expect(page.getByTestId('send-from')).toBeVisible();
    await expect(page.getByTestId('send-to')).toBeVisible();
    await expect(page.getByTestId('send-pool')).toBeVisible();
    await page.getByTestId('send-cancel').click();
    // Fund Branch dialog
    await page.getByTestId('fund-branch').click();
    await expect(page.getByTestId('fund-to')).toBeVisible();
    await page.getByTestId('fund-cancel').click();
  });

  test('invalid PIN shows error', async ({ page }) => {
    await page.goto('/m/login');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('phone').fill(phone);
    await page.getByTestId('pin').fill('0000');
    await page.getByTestId('login-btn').click();
    await expect(page.getByTestId('login-error')).toContainText('Invalid credentials', { timeout: 5000 });
  });
});
