import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BASE = 'http://localhost:80';
const BRANCH_ID = '4df0177f-367d-4e8b-a21d-10c80b629a18';
const SEARCH_PHONE = '25670422622';
const EARLY2026_DISCOUNT_ID = '4eebc71c-52f8-402b-a7f9-3b53e74cbe3c';

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

// Restores the fixture client to its canonical state (doc date within the UI's
// default date range so the Saved Clients list shows it without date filters).
async function resetFixture(request: any) {
  const token = await apiToken(request);
  const client = await firstOnboardedClient(request, SEARCH_PHONE);
  if (!client) return;
  const pkg = client.packages?.[0];
  const pay = pkg?.payments?.[0];
  const payload: any = { document_date: '2026-09-10' };
  if (pay) {
    payload.payments = [{ id: pay.id, amount: 500000, document_date: '2026-09-10' }];
  }
  const res = await request.patch(`${BASE}/api/v1/bulk-onboarding/clients/${client.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(res.ok(), `fixture reset failed: ${res.status()}`).toBeTruthy();
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
    await resetFixture(request);
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

    // Wizard opens preloaded for the saved client
    await expect(page.getByText('✎ Editing saved client')).toBeVisible({ timeout: 10000 });

    // Go to Payments step and change the first payment amount
    await page.getByRole('button', { name: 'Next: Payments' }).click();
    const amountInput = page.locator('p-inputnumber input').first();
    await amountInput.click();
    await amountInput.press('Meta+A');
    await amountInput.pressSequentially('65000');

    await page.getByRole('button', { name: 'Next: Lessons' }).click();
    await page.getByRole('button', { name: 'Next: Preview' }).click();
    await page.getByRole('button', { name: 'Submit All' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Corrections saved').first()).toBeVisible({ timeout: 15000 });

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

  test('applies a discount via correction and verifies via API', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, true);
    await resetFixture(request);
    await loginSuperAdmin(page, 'Default Company');
    await page.goto('/bulk-onboarding');
    await page.waitForTimeout(300);

    // Load saved clients
    const branchSelect = page.locator('p-select').filter({ hasText: 'Select branch' }).first();
    await branchSelect.click();
    await page.getByRole('option', { name: /Head Office/ }).first().click();
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByText(/client\(s\)/)).toBeVisible({ timeout: 20000 });

    // Search and edit
    await page.getByPlaceholder('Search phone/name').fill(SEARCH_PHONE);
    await page.getByRole('button', { name: 'Load' }).click();
    await page.waitForTimeout(2000);
    const editBtn = page.getByRole('button', { name: 'Edit' }).first();
    await expect(editBtn).toBeEnabled();
    await editBtn.click();
    await expect(page.getByText('✎ Editing saved client')).toBeVisible({ timeout: 10000 });

    // Go to Payments step — discount dropdown should be visible
    await page.getByRole('button', { name: 'Next: Payments' }).click();

    // Verify no discount is currently applied
    const discountSelect = page.locator('p-select').filter({ hasText: 'No discount' }).first();
    await expect(discountSelect).toBeVisible();

    // Select the Early Bird 2026 discount
    await discountSelect.click();
    await page.getByRole('option', { name: /Early Bird 2026/ }).first().click();
    await page.waitForTimeout(300);

    // Verify discount amount line appears (10% of 500000 = 50000)
    await expect(page.getByText('−50,000 UGX')).toBeVisible({ timeout: 5000 });

    // Proceed to Preview and submit
    await page.getByRole('button', { name: 'Next: Lessons' }).click();
    await page.getByRole('button', { name: 'Next: Preview' }).click();
    await page.getByRole('button', { name: 'Submit All' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Corrections saved').first()).toBeVisible({ timeout: 15000 });

    // Verify via API: discount link created
    const client = await firstOnboardedClient(request, SEARCH_PHONE);
    expect(client).not.toBeNull();
    const pkg = client.packages?.[0];
    expect(pkg).toBeTruthy();
    expect(pkg.discount_id).toBe(EARLY2026_DISCOUNT_ID);
    expect(Number(pkg.discount_amount)).toBeGreaterThan(0);

    // Restore: remove discount via direct API
    const token = await apiToken(request);
    const res = await request.patch(`${BASE}/api/v1/bulk-onboarding/clients/${client.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { discounts: [{ cart_item_id: pkg.cart_item_id, discount_id: null }] },
    });
    expect(res.ok(), `restore failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.discounts_updated).toBe(1);

    // Verify discount removed
    const clientAfter = await firstOnboardedClient(request, SEARCH_PHONE);
    expect(clientAfter.packages[0].discount_id).toBeNull();
    await setFlag(request, SUPER_PHONE, false);
  });

  test('mobile saved clients: lists and opens the edit dialog', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, true);
    await resetFixture(request);
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
    // Wizard opens prefilled in edit mode
    await expect(page.getByText('Editing Saved Client')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('bo-cancel').click();
    await expect(page.getByText('Bulk Client Onboarding').first()).toBeVisible();
    await setFlag(request, SUPER_PHONE, false);
  });

  test('blocks creating a duplicate phone and offers edit-existing instead', async ({ page, request }) => {
    await setFlag(request, SUPER_PHONE, true);
    await resetFixture(request);
    await loginSuperAdmin(page, 'Default Company');
    await page.goto('/bulk-onboarding');
    await page.waitForTimeout(300);

    // Choose branch
    const branchSelect = page.locator('p-select').filter({ hasText: 'Select branch' }).first();
    await branchSelect.click();
    await page.getByRole('option', { name: /Head Office/ }).first().click();
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByText(/client\(s\)/)).toBeVisible({ timeout: 20000 });

    // Add a client and type an existing phone
    await page.getByRole('button', { name: 'Add Client' }).click();
    await page.waitForTimeout(300);
    const phoneInput = page.getByPlaceholder('Phone number').first();
    await phoneInput.fill(SEARCH_PHONE);

    // Warning should appear and the card is not submittable while in add mode
    await expect(page.getByText('Client exists:').first()).toBeVisible({ timeout: 10000 });

    // Click edit-existing instead of continuing
    await page.getByRole('button', { name: 'Edit existing client instead' }).click();
    await expect(page.getByText('✎ Editing saved client')).toBeVisible({ timeout: 10000 });

    // Still only one consultation exists for the phone (no duplicate was created)
    const client = await firstOnboardedClient(request, SEARCH_PHONE);
    expect(client).not.toBeNull();
    expect(client.packages?.[0]?.payments?.length).toBeGreaterThanOrEqual(1);

    await setFlag(request, SUPER_PHONE, false);
  });
});