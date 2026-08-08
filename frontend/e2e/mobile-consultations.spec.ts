import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:80';
const PRODUCT_ID = '7329c776-cb84-4249-90de-cb34cf276243';
const PACKAGE_ID = '6e14b01d-5661-4938-8ec5-b4de4aee2e77';

let api: APIRequestContext;
let token = '';

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: 'http://localhost:8000' });
  const res = await api.post('/api/v1/auth/login', {
    data: { phone: '0782832711', pin: '1234' },
  });
  token = (await res.json()).access_token;
});

test.afterAll(async () => {
  await api.dispose();
});

async function login(page: import('@playwright/test').Page) {
  await page.goto('/m/login');
  await page.getByTestId('phone').fill('0782832711');
  await page.getByTestId('pin').fill('1234');
  await page.getByTestId('login-btn').click();
  await page.waitForTimeout(2500);
}

test('sales home: side-by-side buttons + tabs + active clients list', async ({ page }) => {
  await login(page);
  await page.goto('/m/sales');
  await expect(page.getByTestId('new-sale')).toBeVisible();
  await expect(page.getByTestId('previous-sale')).toBeVisible();
  await expect(page.getByTestId('active-tab')).toBeVisible();
  await expect(page.getByTestId('consultations-tab')).toBeVisible();
  await expect(page.getByText('New Sale')).toBeVisible();
  await expect(page.getByText('Prev Sale')).toBeVisible();

  await expect(page.getByTestId('active-search')).toBeVisible();
  await expect(page.getByTestId('active-client').first()).toBeVisible({ timeout: 10000 });

  await page.getByTestId('active-search').fill('zzzzzz-no-match');
  await expect(page.getByText('No clients match your search.')).toBeVisible({ timeout: 10000 });
});

test('active client opens consultation detail; unpaid product can be removed', async ({ page }) => {
  const phone = `25679${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: 'RemoveTest',
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  await login(page);
  await page.goto(`/m/consultations/${consultation.id}`);

  await expect(page.getByText('RemoveTest')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('detail-add-product')).toBeVisible();
  await expect(page.getByTestId('detail-collect-payment')).toBeVisible();
  await expect(page.getByText('Full Package')).toBeVisible({ timeout: 10000 });

  const removeBtn = page.getByTestId('remove-product');
  await expect(removeBtn).toBeVisible();
  await removeBtn.click();
  await expect(page.getByText('No products on this consultation.')).toBeVisible({ timeout: 10000 });
});

test('consultations tab search + open detail', async ({ page }) => {
  await login(page);
  await page.goto('/m/sales');
  await page.getByTestId('consultations-tab').click();
  await expect(page.getByTestId('consultation-search')).toBeVisible();
  await page.getByTestId('consultation-search').fill('Kawuma');
  await expect(page.getByTestId('consultation-item').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('consultation-item').first().click();
  await expect(page.getByText('Consultation')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('detail-add-product')).toBeVisible();
});

test('new sale with existing phone shows dialog; continue as new works', async ({ page }) => {
  await login(page);
  await page.goto('/m/sales');
  await page.getByTestId('new-sale').click();
  await page.getByTestId('client-phone').fill('0986734');
  await page.getByTestId('client-first').fill('Kagoda');
  await page.getByTestId('continue-client').click();

  await expect(page.getByText('Client already exists')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('continue-as-new').click();
  await expect(page.getByText('Step 2 of 3 · Products')).toBeVisible({ timeout: 10000 });
});

test('new sale existing phone -> Go to Consultations navigates to detail', async ({ page }) => {
  await login(page);
  await page.goto('/m/sales');
  await page.getByTestId('new-sale').click();
  await page.getByTestId('client-phone').fill('0986734');
  await page.getByTestId('client-first').fill('Kagoda');
  await page.getByTestId('continue-client').click();

  await expect(page.getByText('Client already exists')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByTestId('go-to-consultations').click();
  await page.waitForURL(/\/m\/consultations\//, { timeout: 10000 });
  await expect(page.getByTestId('detail-add-product')).toBeVisible({ timeout: 10000 });
});

test('recommender selects preselect current user', async ({ page }) => {
  await login(page);
  await page.goto('/m/sales');
  await page.getByTestId('new-sale').click();
  await page.getByTestId('client-phone').fill(`25670${Math.floor(100000 + Math.random() * 899999)}`);
  await page.getByTestId('client-first').fill('Preselect');
  await page.getByTestId('continue-client').click();
  await expect(page.getByText('Step 2 of 3 · Products')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('add-package').first().click();
  await page.getByTestId('continue-payment').click();
  await expect(page.getByText('Step 3 of 3 · Payment')).toBeVisible({ timeout: 10000 });

  await expect(
    page.getByTestId('converter').getByRole('combobox').first(),
  ).toHaveAttribute('aria-label', /Super Admin · 0782832711/);
});
