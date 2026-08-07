import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

test.describe('Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('permissions page loads with catalog groups and matrix', async ({ page }) => {
    await page.locator('aside').getByText('Management').click();
    await page.locator('aside').getByText('Permissions').click();
    await expect(page).toHaveURL(/\/permissions/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Permissions');
    await expect(page.getByText('Branch Transfers').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Companies').first()).toBeVisible();
    await expect(page.getByText('Roles & Permissions').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  });

  test('role matrix can be edited and saved', async ({ page }) => {
    const token = await page.evaluate(
      async ({ phone, pin }) => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        return (await res.json()).access_token;
      },
      { phone: SUPER_PHONE, pin: SUPER_PIN },
    );

    const before = await page.evaluate(
      async ({ token, companyId }) => {
        const res = await fetch(`/api/v1/permissions/role/reception?company_id=${companyId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return (await res.json()).permissions as string[];
      },
      { token, companyId: COMPANY_ID },
    );
    expect(before).toContain('consultations.create');

    await page.goto('/permissions');
    await expect(page.locator('h1')).toContainText('Permissions');

    await page.locator('p-select').nth(1).click();
    await page.getByRole('option', { name: 'Reception' }).click();
    await expect(page.locator('[id="cb-consultations.create"]')).toBeVisible();

    await page.locator('label').filter({ hasText: 'consultations.create' }).click();
    await expect(page.locator('[id="cb-consultations.create"]')).not.toBeChecked();

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText(/permissions updated/)).toBeVisible({ timeout: 10000 });

    const after = await page.evaluate(
      async ({ token, companyId }) => {
        const res = await fetch(`/api/v1/permissions/role/reception?company_id=${companyId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return (await res.json()).permissions as string[];
      },
      { token, companyId: COMPANY_ID },
    );
    expect(after).not.toContain('consultations.create');

    await page.evaluate(
      async ({ token, companyId, before }) => {
        await fetch(`/api/v1/permissions/matrix/reception?company_id=${companyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ permissions: before }),
        });
      },
      { token, companyId: COMPANY_ID, before },
    );
  });
});
