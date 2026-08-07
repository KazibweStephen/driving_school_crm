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
    await companySelection.waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('Default Company', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No company selection; proceed to dashboard
  }
  await expect(page).toHaveURL(/\/m\/dashboard$/, { timeout: 10000 });
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

  test('office admin can log in and see dashboard', async ({ page }) => {
    await mobileLogin(page);
    await expect(page.getByText('Daily Sales')).toBeVisible();
    await expect(page.getByTestId('qa-sale')).toBeVisible();
  });

  test('bottom nav shows home and admin tabs', async ({ page }) => {
    await mobileLogin(page);
    const nav = page.locator('nav');
    await expect(nav.getByText('Home')).toBeVisible();
    await expect(nav.getByText('Sales')).toBeVisible();
    await expect(nav.getByText('Payments')).toBeVisible();
    await expect(nav.getByText('Lessons')).toBeVisible();
    await expect(nav.getByText('Schedule')).toBeVisible();
    await expect(nav.getByText('SMS')).toBeVisible();
    await expect(nav.getByText('Expenses')).toBeVisible();
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

  test('invalid PIN shows error', async ({ page }) => {
    await page.goto('/m/login');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('phone').fill(phone);
    await page.getByTestId('pin').fill('0000');
    await page.getByTestId('login-btn').click();
    await expect(page.getByTestId('login-error')).toContainText('Invalid credentials', { timeout: 5000 });
  });
});
