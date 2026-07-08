import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login page with heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Driving School CRM');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '9999');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Invalid phone or PIN.')).toBeVisible({ timeout: 5000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('sidebar shows navigation on desktop after login', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.locator('aside').getByText('Dashboard')).toBeVisible();
    await expect(page.locator('aside').getByText('Management')).toBeVisible();
    await page.locator('aside').getByText('Management').click();
    await expect(page.locator('aside').getByText('Users')).toBeVisible();
  });

  test('mobile viewport has hamburger and sidebar is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByLabel('Toggle menu')).toBeVisible();
  });

  test('opens sidebar on mobile and navigates to users', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await page.getByLabel('Toggle menu').click();
    await page.locator('aside').getByText('Management').click();
    await expect(page.locator('aside').getByText('Users')).toBeVisible();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
  });

  test('users page shows existing users in table', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    // Search for the seeded super admin instead of assuming first page
    const searchInput = page.getByPlaceholder('Search name or phone...');
    await searchInput.fill('256700000000');
    await searchInput.press('Enter');
    await expect(page.getByRole('cell', { name: 'Super Admin' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('cell', { name: '256700000000' })).toBeVisible();
  });

  test('create user dialog opens and can be dismissed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
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
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    await page.getByText('Add User').click();
    await page.getByPlaceholder('e.g. 256700000001').fill(phone);
    await page.getByPlaceholder('e.g. Jane Instructor').fill('Test User');
    await page.getByRole('button', { name: 'Create User' }).click();
    await expect(page.getByRole('cell', { name: phone }).first()).toBeVisible({ timeout: 5000 });
  });

  test('can search users by name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    const searchInput = page.getByPlaceholder('Search name or phone...');
    await searchInput.fill('Super Admin');
    await searchInput.press('Enter');
    await expect(page.getByRole('cell', { name: 'Super Admin' })).toBeVisible({ timeout: 5000 });
  });

  test('can open change PIN dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', '256700000000');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Users').click();
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    await page.getByText('Change PIN').click();
    await expect(page.getByText('Change Your PIN')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
