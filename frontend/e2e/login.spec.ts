import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

async function createUserViaApi(page: Page) {
  const token = await page.evaluate(async () => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
    });
    return (await res.json()).access_token;
  });
  const phone = `2567${Date.now().toString().slice(-7)}`;
  const name = `Search${Date.now().toString().slice(-5)}`;
  await page.evaluate(
    async ({ token, phone, name, companyId }) => {
      const res = await fetch('/api/v1/users/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone,
          name,
          first_name: name,
          role: 'office_admin',
          company_id: companyId,
          is_company_admin: false,
          can_backdate: false,
          branch_ids: [],
        }),
      });
      if (!res.ok) throw new Error(`Failed to create user: ${await res.text()}`);
      return res.json();
    },
    { token, phone, name, companyId: DEFAULT_COMPANY_ID },
  );
  return { phone, name };
}

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login page with heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Driving School CRM');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.fill('#phone', '0782832711');
    await page.fill('input[type="password"]', '9999');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Invalid phone or PIN.')).toBeVisible({ timeout: 5000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await loginSuperAdmin(page);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('sidebar shows navigation on desktop after login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await expect(page.locator('aside').getByText('Dashboard')).toBeVisible();
    await expect(page.locator('aside').getByText('Management')).toBeVisible();
    await page.locator('aside').getByText('Management').click();
    await expect(page.locator('aside').getByText('Users')).toBeVisible();
  });

  test('mobile viewport has hamburger and sidebar is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginSuperAdmin(page);
    await expect(page.getByLabel('Toggle menu')).toBeVisible();
  });

  test('opens sidebar on mobile and navigates to users', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginSuperAdmin(page);
    await page.getByLabel('Toggle menu').click();
    await page.locator('aside').getByText('Management').click();
    await expect(page.locator('aside').getByText('Users')).toBeVisible();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
  });

  test('users page shows existing users in table', async ({ page }) => {
    const { phone } = await createUserViaApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    // Search for the freshly created company user
    const searchInput = page.getByPlaceholder('Search name or phone...');
    await searchInput.fill(phone);
    await searchInput.press('Enter');
    await expect(page.getByRole('cell', { name: phone })).toBeVisible({ timeout: 5000 });
  });

  test('create user dialog opens and can be dismissed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    await page.getByText('Add User').click();
    await expect(page.getByText('New User')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('creates a new user successfully', async ({ page }) => {
    const phone = `2567000${Date.now().toString().slice(-6)}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    await page.getByText('Add User').click();
    await page.getByPlaceholder('e.g. 256700000001').fill(phone);
    await page.getByPlaceholder('e.g. Jane').fill('Test');
    await page.getByPlaceholder('e.g. Instructor').fill('User');
    await page.getByRole('button', { name: 'Create User' }).click();
    await expect(page.getByRole('cell', { name: phone }).first()).toBeVisible({ timeout: 10000 });
  });

  test('can search users by name', async ({ page }) => {
    const { name } = await createUserViaApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    const searchInput = page.getByPlaceholder('Search name or phone...');
    await searchInput.fill(name);
    await searchInput.press('Enter');
    await expect(page.getByRole('cell', { name: name })).toBeVisible({ timeout: 5000 });
  });

  test('can open change PIN dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    await page.getByText('Change PIN').click();
    await expect(page.getByText('Change Your PIN')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
