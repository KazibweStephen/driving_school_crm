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

// Create a consultation whose package is partially paid (converted_paying, balance > 0)
async function createPartialPaidClient(name: string, prefix: string) {
  const phone = `${prefix}${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: name,
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  const prod = await api.get(`/api/v1/products/${PRODUCT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const product = await prod.json();
  const price = Number(product.packages.find((p: any) => p.id === PACKAGE_ID).price);
  const partial = Math.round(price / 2);

  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const payRes = await api.post(`/api/v1/consultations/${consultation.id}/payments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      product_id: PRODUCT_ID,
      package_id: PACKAGE_ID,
      total_amount: price,
      document_date: today,
      installments: [
        { due_date: today, amount: partial },
        { due_date: week, amount: price - partial },
      ],
    },
  });
  expect(payRes.ok()).toBeTruthy();
  const payment = await payRes.json();
  const inst = payment.installments[0];

  const updRes = await api.patch(
    `/api/v1/payments/${payment.id}/installments/${inst.id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { paid_date: today, paid_amount: partial, notes: 'test partial' },
    },
  );
  expect(updRes.ok()).toBeTruthy();

  // create_full returns an empty cart_items array, so reload to get the real item id
  const cRes = await api.get(`/api/v1/consultations/${consultation.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const full = await cRes.json();
  const ci = full.cart_items[0];
  if (ci) {
    await api.patch(`/api/v1/cart-items/${ci.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'converted_paying' },
    });
  }
  return { phone, consultation, price, partial };
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

test('consultations tab touch routes to sales with preloaded products', async ({ page }) => {
  const phone = `25679${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: 'TouchTest',
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  await login(page);
  await page.goto('/m/sales');
  await page.getByTestId('consultations-tab').click();
  await expect(page.getByTestId('consultation-search')).toBeVisible();
  await page.getByTestId('consultation-search').fill('TouchTest');
  await expect(page.getByTestId('consultation-item').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('consultation-item').first().click();

  await expect(page.getByText('Step 2 of 3 · Products')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Full Package').last()).toBeVisible({ timeout: 10000 });

  await page.getByTestId('remove-selected').first().click();
  await expect(page.getByText('Adding')).not.toBeVisible();
  await page.getByTestId('continue-payment').click();
  await expect(page.getByText('Add at least one product or package')).toBeVisible({ timeout: 10000 });
});

test('client pays from consultations then appears under Active Clients', async ({ page }) => {
  const phone = `25678${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: 'PayTest',
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  const prod = await api.get(`/api/v1/products/${PRODUCT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const product = await prod.json();
  const price = Number(product.packages.find((p: any) => p.id === PACKAGE_ID).price);

  await login(page);
  await page.goto(`/m/consultations/${consultation.id}`);
  await expect(page.getByText('PayTest')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('detail-collect-payment').click();
  await page.waitForURL(/\/m\/payments/, { timeout: 10000 });

  await expect(page.getByTestId('collect-payment').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('collect-payment').first().click();
  await expect(page.getByTestId('collect-amount')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('collect-amount').fill(String(price));
  await page.getByTestId('record-payment').click();
  await expect(page.getByText('Payment recorded')).toBeVisible({ timeout: 15000 });

  await page.goto('/m/sales');
  await expect(page.getByTestId('active-search')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('active-search').fill(phone);
  await expect(page.getByTestId('active-client').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('PayTest')).toBeVisible({ timeout: 10000 });
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

test('partial collect computes schedule and records future installments', async ({ page }) => {
  const phone = `25690${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: 'SchedTest',
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  const prod = await api.get(`/api/v1/products/${PRODUCT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const product = await prod.json();
  const price = Number(product.packages.find((p: any) => p.id === PACKAGE_ID).price);
  const partial = Math.round(price / 2);

  await login(page);
  await page.goto(`/m/consultations/${consultation.id}`);
  await expect(page.getByText('SchedTest')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('detail-collect-payment').click();
  await page.waitForURL(/\/m\/payments/, { timeout: 10000 });

  await expect(page.getByTestId('collect-payment').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('collect-payment').first().click();
  await expect(page.getByTestId('collect-amount')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('collect-amount').fill(String(partial));

  // Schedule builder appears for the remaining balance, initially empty
  await expect(page.getByTestId('calculate-schedule')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('No schedule yet')).toBeVisible();

  // Compute splits the remaining balance into two installments
  await page.getByTestId('calculate-schedule').click();
  await expect(page.getByTestId('schedule-amount')).toHaveCount(2);

  await page.getByTestId('record-payment').click();
  await expect(page.getByText('Payment received')).toBeVisible({ timeout: 15000 });

  // Verify the payment now carries 1 paid installment + 2 pending
  const paysRes = await api.get(`/api/v1/consultations/${consultation.id}/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payments = await paysRes.json();
  const p = payments.find((x: any) => x.product_id === PRODUCT_ID);
  expect(p).toBeTruthy();
  expect(Number(p.total_amount)).toBe(price);
  const paidInsts = p.installments.filter((i: any) => i.status === 'paid');
  const pendingInsts = p.installments.filter((i: any) => i.status === 'pending');
  expect(paidInsts).toHaveLength(1);
  expect(pendingInsts).toHaveLength(2);
  expect(Number(paidInsts[0].paid_amount)).toBe(partial);

  // Cart item should be converted_paying
  const cRes = await api.get(`/api/v1/consultations/${consultation.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const full = await cRes.json();
  const item = full.cart_items.find((ci: any) => ci.product_id === PRODUCT_ID);
  expect(item.status).toBe('converted_paying');
});

test('calculate schedule is stable across repeated presses (never shrinks)', async ({ page }) => {
  const phone = `25720${Math.floor(10000000 + Math.random() * 89999999)}`;
  const res = await api.post('/api/v1/consultations/full', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone,
      first_name: 'StableSched',
      branch_id: '00000000-0000-0000-0000-000000000002',
      items: [{ product_id: PRODUCT_ID, package_id: PACKAGE_ID, allocation: 0, installments: [] }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const consultation = await res.json();

  const prod = await api.get(`/api/v1/products/${PRODUCT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const product = await prod.json();
  const price = Number(product.packages.find((p: any) => p.id === PACKAGE_ID).price);
  const partial = Math.round(price / 2);
  const remaining = price - partial;

  await login(page);
  await page.goto(`/m/consultations/${consultation.id}`);
  await expect(page.getByText('StableSched')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('detail-collect-payment').click();
  await page.waitForURL(/\/m\/payments/, { timeout: 10000 });
  await page.getByTestId('collect-payment').first().click();
  await page.getByTestId('collect-amount').fill(String(partial));

  // First Calculate: splits the remaining balance into two equal installments
  await page.getByTestId('calculate-schedule').click();
  await expect(page.getByTestId('schedule-amount')).toHaveCount(2);
  const values = () =>
    page
      .getByTestId('schedule-amount')
      .evaluateAll((els) => els.map((el) => Number((el as HTMLInputElement).value)));
  const first = await values();
  expect(Math.round(first[0] + first[1])).toBe(remaining);

  // Pressing Calculate again with the same received amount must NOT shrink the schedule
  await page.getByTestId('calculate-schedule').click();
  const second = await values();
  expect(second).toEqual(first);

  // Changing the received amount re-derives installments from (balance - received)
  await page.getByTestId('collect-amount').fill(String(remaining));
  await page.getByTestId('calculate-schedule').click();
  const third = await values();
  expect(Math.round(third[0] + third[1])).toBe(partial);
});

test('payments page lists clients with payments due; tap opens overview', async ({ page }) => {
  const { phone } = await createPartialPaidClient('OutstandingTest', '25650');

  await login(page);
  await page.goto('/m/payments');
  await expect(page.getByText('Clients with payments due')).toBeVisible();
  await expect(page.getByTestId('outstanding-client').first()).toBeVisible({ timeout: 15000 });

  // searching refines the outstanding list to the fixture client
  await page.getByTestId('client-search').fill(phone);
  await expect(
    page.getByTestId('outstanding-client').filter({ hasText: phone }),
  ).toBeVisible({ timeout: 10000 });

  await page.getByTestId('outstanding-client').first().click();
  await expect(page.getByTestId('collect-payment').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Balance:.*150,000/).first()).toBeVisible({ timeout: 10000 });
});

test('upsell shows Pay button on unpaid items that opens the collect flow', async ({ page }) => {
  const { consultation } = await createPartialPaidClient('PayBtnTest', '25660');

  await login(page);
  await page.goto(`/m/sales?upsell=1&id=${consultation.id}`);
  await expect(page.getByText('Already purchased')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('pay-existing').first()).toBeVisible();
  await page.getByTestId('pay-existing').first().click();
  await page.waitForURL(/\/m\/payments/, { timeout: 10000 });
  await expect(page.getByTestId('collect-amount')).toBeVisible({ timeout: 10000 });
});
