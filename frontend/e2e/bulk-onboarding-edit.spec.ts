import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BASE = 'http://localhost:80';

async function apiToken(request: any): Promise<string> {
  const res = await request.post(`${BASE}/api/v1/auth/login`, {
    data: { phone: SUPER_PHONE, pin: '1234' },
  });
  const body = await res.json();
  return body.access_token;
}

async function setFlag(request: any, phone: string, value: boolean) {
  const token = await apiToken(request);
  const res = await request.patch(`${BASE}/api/v1/users/${phone}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { can_edit_onboarded_clients: value },
  });
  expect(res.ok(), `flag PATCH failed: ${res.status()}`).toBeTruthy();
}

async function firstOnboardedClient(request: any, search: string) {
  const token = await apiToken(request);
  const res = await request.get(
    `${BASE}/api/v1/bulk-onboarding/clients?branch_id=4df0177f-367d-4e8b-a21d-10c80b629a18&from_date=2026-01-01&search=${search}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json();
  return body.clients?.[0] || null;
}

test.describe('Bulk Onboarding Corrections', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('Saved Clients section shows and edit requires the flag', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, false);
    await loginSuperAdmin(page, 'Default Company');
    await page.goto('/bulk-onboarding');

    await expect(page.getByText('Saved Clients', { exact: false }).first()).toBeVisible();

    // Flag off => editing disabled (server also enforces 403)
    await expect(page.getByText(/Editing is disabled for your account/)).toBeVisible();

    await setFlag(request, SUPER_PHONE, true);
    await loginSuperAdmin(page, 'Default Company');
    await page.goto('/bulk-onboarding');
    await page.waitForTimeout(500);
    await expect(page.getByText(/Editing is disabled for your account/)).toBeHidden();
    await setFlag(request, SUPER_PHONE, false);
  });

  test('loads saved clients, edits a payment and API reflects it', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, true);
    await loginSuperAdmin(page, 'Default Company');
    await page.goto('/bulk-onboarding');
    await page.waitForTimeout(300);

    // Choose the branch in the p-select
    const branchSelect = page.locator('p-select').filter({ hasText: 'Select branch' }).first();
    await branchSelect.click();
    await page.getByRole('option', { name: /Head Office/ }).first().click();

    const loadBtn = page.getByRole('button', { name: 'Load' });
    await loadBtn.click();
    await expect(page.getByText(/client\(s\)/)).toBeVisible({ timeout: 20000 });

    const search = '25670422622';
    await page.getByPlaceholder('Search phone/name').fill(search);
    await loadBtn.click();
    await page.waitForTimeout(2000);

    const editBtn = page.getByRole('button', { name: 'Edit' }).first();
    await expect(editBtn).toBeEnabled();
    await editBtn.click();

    await expect(page.getByText('Edit Onboarded Client')).toBeVisible({ timeout: 10000 });

    const amountInput = page.locator('p-dialog input[type="number"]').first();
    await amountInput.click();
    await amountInput.fill('65000');

    await page.getByRole('button', { name: 'Save Corrections' }).click();
    await expect(page.getByText('Corrections saved')).toBeVisible({ timeout: 15000 });

    const client = await firstOnboardedClient(request, search);
    expect(client).not.toBeNull();
    const pkg = client.packages?.[0];
    expect(pkg).toBeTruthy();
    const pay = pkg.payments?.[0];
    expect(Number(pay.amount)).toBe(65000);

    // Restore
    const token = await apiToken(request);
    const res = await request.patch(`${BASE}/api/v1/bulk-onboarding/clients/${client.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { payments: [{ id: pay.id, amount: 500000, document_date: '2026-09-10' }] },
    });
    expect(res.ok(), `restore failed: ${res.status()}`).toBeTruthy();
    await setFlag(request, SUPER_PHONE, false);
  });

  test('backend rejects edits without the flag (PATCH == 403)', async ({ page, request }) => {
    await loginSuperAdmin(page, 'Default Company');
    await setFlag(request, SUPER_PHONE, false);
    const token = await apiToken(request);
    const res = await request.patch(`${BASE}/api/v1/bulk-onboarding/clients/${ZERO_UUID}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { document_date: '2026-09-01' },
    });
    expect(res.status()).toBe(403);
  });

  test('mobile saved clients: lists and opens the edit dialog', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, true);
    await page.goto('/m/login');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('phone').fill('0782832711');
    await page.getByTestId('pin').fill('1234');
    await page.getByTestId('login-btn').click();
    const companySelection = page.getByTestId('company-selection');
    try {
      await companySelection.waitFor({ state: 'visible', timeout: 10000 });
      await page.getByText('Default Company', { exact: true }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
    } catch {
      /* no company prompt */
    }
    await expect(page).toHaveURL(/\/m\/home$/, { timeout: 10000 });
    await page.goto('/m/bulk-onboarding');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Saved Clients').first()).toBeVisible();

    // Choose a branch (super admin owns several "Head Office" branches)
    const select = page.locator('p-select').first();
    await select.click();
    await page.getByRole('option', { name: /Head Office/ }).first().click();

    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByText(/found/)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByText('Edit Onboarded Client')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await setFlag(request, SUPER_PHONE, false);
  });
});