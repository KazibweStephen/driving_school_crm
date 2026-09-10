import { test, expect, Page } from '@playwright/test';

const phone = '0782832711';
const pin = '1234';

async function mobileLogin(page: Page) {
  await page.goto('/m/login');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('phone').fill(phone);
  await page.getByTestId('pin').fill(pin);
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

test.describe('Mobile End of Day', () => {
  test('shows computed figures and flags variation immediately on save', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mobileLogin(page);

    // API: create a that-day new sale, then save a MATCHED report.
    const run = await page.evaluate(
      async ({ phone, pin }) => {
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
            first_name: 'MobileEOD',
            last_name: 'Spec',
            branch_id: branch.id,
            document_date: today,
            items: [{ product_id: prod.id, package_id: pkg.id || null, allocation: paid }],
            payment: { receipt_number: `MEOD${Date.now()}`, transaction_date: today },
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
      { phone, pin },
    );

    await page.goto('/m/finance/end-of-day');
    await expect(page.getByRole('heading', { name: 'End of Day' })).toBeVisible({ timeout: 10000 });

    // Summary cards render with computed figures.
    await expect(page.getByTestId('eod-branch')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('New Sales').first()).toBeVisible();
    await expect(page.getByText('Expected Cash').first()).toBeVisible();

    // The matched baseline report loads into the entry form.
    await expect(page.getByText(/Cash reconciles/).first()).toBeVisible({ timeout: 5000 });

    // Enter a mismatching cash count → live variation appears immediately.
    const cashInput = page.getByTestId('eod-cash');
    await expect(cashInput).toBeVisible({ timeout: 5000 });
    await cashInput.click();
    await cashInput.press('ControlOrMeta+a');
    await cashInput.fill('1');
    await expect(page.getByText(/Variation/).first()).toBeVisible({ timeout: 5000 });

    // Save → discrepancy is flagged immediately.
    await page.getByTestId('eod-save').click();
    await expect(page.getByText(/VARIATION DETECTED/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/discrepancy/i).first()).toBeVisible({ timeout: 5000 });

    // Cleanup: restore a matched report so the test is idempotent.
    await page.evaluate(
      async ({ phone, pin, branchId, expected }) => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        const token = (await res.json()).access_token;
        await fetch('/api/v1/finance/end-of-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            branch_id: branchId,
            report_date: new Date().toISOString().slice(0, 10),
            cash_at_hand: expected,
            consultations_count: 1,
            new_clients_count: 1,
            notes: 'e2e baseline',
          }),
        });
      },
      { phone, pin, branchId: run.branch_id, expected: run.expected },
    );
  });
});