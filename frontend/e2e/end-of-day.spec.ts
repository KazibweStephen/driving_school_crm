import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';

// Both tests live in ONE file so they run sequentially in a single worker and
// never race each other over today's shared branch report.

async function mobileLogin(page: Page) {
  await page.goto('/m/login');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('phone').fill(SUPER_PHONE);
  await page.getByTestId('pin').fill(SUPER_PIN);
  await page.getByTestId('login-btn').click();
  const companySelection = page.getByTestId('company-selection');
  try {
    await companySelection.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('Default Company', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No company selection
  }
  await expect(page).toHaveURL(/\/m\/home$/, { timeout: 10000 });
}

// Creates a that-day new sale, saves a MATCHED report, and returns the branch.
async function setupReport(page: Page, first_name: string) {
  return page.evaluate(
    async ({ phone, pin, first_name }) => {
      const today = new Date().toISOString().slice(0, 10);
      let res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const token = (await res.json()).access_token;

      res = await fetch('/api/v1/companies/my-branches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const branch = (await res.json())[0];

      res = await fetch('/api/v1/products?status=active&page_size=5', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const prod = (await res.json()).products[0];
      const pkg = (prod.packages || [{}])[0];
      const price = Number(pkg.price || pkg.total_price || 10000);
      const paid = Math.round(price * 0.1);

      res = await fetch('/api/v1/consultations/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phone: `2567${Date.now().toString().slice(-10)}`,
          first_name,
          last_name: 'Spec',
          branch_id: branch.id,
          document_date: today,
          items: [{ product_id: prod.id, package_id: pkg.id || null, allocation: paid }],
          payment: { receipt_number: `EOD${Date.now()}`, transaction_date: today },
        }),
      });
      await res.json();

      res = await fetch(`/api/v1/finance/end-of-day?branch_id=${branch.id}&report_date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const preview = await res.json();
      const expected = preview.summary.expected_cash_at_hand;
      if (!(preview.summary.cash_from_new_sales > 0)) {
        throw new Error('No cash from new sales computed for today');
      }

      const save = async (cash: number, notes: string) => {
        const r = await fetch('/api/v1/finance/end-of-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            branch_id: branch.id,
            report_date: today,
            cash_at_hand: cash,
            consultations_count: 1,
            new_clients_count: 1,
            notes,
          }),
        });
        return r.json();
      };

      const matched = await save(expected, 'e2e baseline');
      return { branch_id: branch.id, expected, matched_status: matched.status };
    },
    { phone: SUPER_PHONE, pin: SUPER_PIN, first_name },
  );
}

// Re-fetch live figures and report status; retry until the saved report matches.
// Other parallel spec files may add sales to today's branch, so the goalposts
// can move between fetching and saving.
async function reconcileUntilMatched(page: Page, branchId: string, cashFn, saveFn) {
  const fetchLive = () =>
    page.evaluate(
      async ({ phone, pin, branchId }) => {
        const today = new Date().toISOString().slice(0, 10);
        const r = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        const token = (await r.json()).access_token;
        const p = await fetch(`/api/v1/finance/end-of-day?branch_id=${branchId}&report_date=${today}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const res = await p.json();
        return {
          expected: res.summary.expected_cash_at_hand,
          expenses: res.summary.cash_expenses,
          status: res.report?.status,
        };
      },
      { phone: SUPER_PHONE, pin: SUPER_PIN, branchId },
    );

  let reconciled = false;
  for (let attempt = 0; attempt < 5 && !reconciled; attempt++) {
    const cur = await fetchLive();
    await cashFn(String(cur.expected));
    await saveFn(String(cur.expenses));
    await page.waitForTimeout(1000);
    reconciled = (await fetchLive()).status === 'matched';
  }
  expect(reconciled).toBe(true);
  await expect(page.getByText(/Cash reconciles/).first()).toBeVisible({ timeout: 5000 });
}

test.describe('End of Day Report', () => {
  test('web page shows computed figures and flags variation immediately on save', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);

    const run = await setupReport(page, 'EndOfDay');

    await page.goto('/end-of-day');
    await expect(page.locator('h1')).toContainText('End of Day', { timeout: 10000 });
    await expect(page.getByText('Cash From New Sales')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Expected Cash At Hand')).toBeVisible();
    await expect(page.getByText(/Cash reconciles/).first()).toBeVisible({ timeout: 5000 });

    const cashInput = page.locator('#eod-cash');
    await expect(cashInput).toBeVisible({ timeout: 5000 });
    await cashInput.click();
    await cashInput.press('ControlOrMeta+a');
    await cashInput.pressSequentially('1');
    await expect(page.getByText(/Variation/).first()).toBeVisible({ timeout: 5000 });

    const expenseInput = page.locator('#eod-expenses');
    await expect(expenseInput).toBeVisible({ timeout: 5000 });
    await expenseInput.click();
    await expenseInput.press('ControlOrMeta+a');
    await expenseInput.pressSequentially('100000');
    await expect(page.getByText(/NO — expense variation/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Save Report' }).click();
    await expect(page.getByText(/SAVED AS DRAFT/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('DRAFT').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Expense variation/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Cash variation/).first()).toBeVisible({ timeout: 5000 });

    await reconcileUntilMatched(
      page,
      run.branch_id,
      async (v) => {
        await cashInput.click();
        await cashInput.press('ControlOrMeta+a');
        await cashInput.pressSequentially(v);
      },
      async (v) => {
        await expenseInput.click();
        await expenseInput.press('ControlOrMeta+a');
        await expenseInput.pressSequentially(v);
        await page.getByRole('button', { name: 'Save Report' }).click();
      },
    );
    await expect(page.getByText('MATCHED').first()).toBeVisible({ timeout: 5000 });
  });

  test('mobile page shows computed figures and flags variation immediately on save', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mobileLogin(page);

    const run = await setupReport(page, 'MobileEOD');

    await page.goto('/m/finance/end-of-day');
    await expect(page.getByRole('heading', { name: 'End of Day' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('eod-branch')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('New Sales').first()).toBeVisible();
    await expect(page.getByText('Expected Cash').first()).toBeVisible();
    await expect(page.getByText(/Cash reconciles/).first()).toBeVisible({ timeout: 5000 });

    const cashInput = page.getByTestId('eod-cash');
    await expect(cashInput).toBeVisible({ timeout: 5000 });
    await cashInput.click();
    await cashInput.fill('1');
    await expect(page.getByText(/Variation/).first()).toBeVisible({ timeout: 5000 });

    const expenseInput = page.getByTestId('eod-expenses');
    await expect(expenseInput).toBeVisible({ timeout: 5000 });
    await expenseInput.click();
    await expenseInput.fill('100000');
    await expect(page.getByText(/NO — expense variation/).first()).toBeVisible({ timeout: 5000 });

    await page.getByTestId('eod-save').click();
    await expect(page.getByText(/SAVED AS DRAFT/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/draft/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Expense variation/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Cash variation/).first()).toBeVisible({ timeout: 5000 });

    await reconcileUntilMatched(
      page,
      run.branch_id,
      async (v) => {
        await cashInput.click();
        await cashInput.fill(v);
      },
      async (v) => {
        await expenseInput.click();
        await expenseInput.fill(v);
        await page.getByTestId('eod-save').click();
      },
    );
    await expect(page.getByText(/matched/).first()).toBeVisible({ timeout: 5000 });
  });
});