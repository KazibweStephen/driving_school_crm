import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';

test.describe('End of Day Report', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('page shows computed figures and flags variation immediately on save', async ({ page }) => {
    // API: create a that-day new sale, then save a MATCHED report so the page
    // loads a reconciling baseline; mismatch-vs-match is verified on the UI.
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
            first_name: 'EndOfDay',
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
      { phone: SUPER_PHONE, pin: SUPER_PIN },
    );

    await page.goto('/end-of-day');
    await expect(page.locator('h1')).toContainText('End of Day', { timeout: 10000 });

    // Summary cards render with the computed figures.
    await expect(page.getByText('Cash From New Sales')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Expected Cash At Hand')).toBeVisible();

    // The matched baseline report loads into the entry form.
    await expect(page.getByText(/Cash reconciles/).first()).toBeVisible({ timeout: 5000 });

    // Enter a cash count that mismatches → live variation appears immediately.
    const cashInput = page.locator('input[inputmode="decimal"]').first();
    await expect(cashInput).toBeVisible({ timeout: 5000 });
    await cashInput.click();
    await cashInput.press('ControlOrMeta+a');
    await cashInput.pressSequentially('1');
    await expect(page.getByText(/Variation/).first()).toBeVisible({ timeout: 5000 });

    // Save → discrepancy is flagged immediately.
    await page.getByRole('button', { name: 'Save Report' }).click();
    await expect(page.getByText(/VARIATION DETECTED/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/DISCREPANCY/).first()).toBeVisible({ timeout: 5000 });

    // Cleanup: restore a matched report so the test is idempotent across runs.
    await page.evaluate(
      async ({ tokenless, lan, phone, pin, branchId, expected }) => {
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
      { lan: 'x', tokenless: 1, phone: SUPER_PHONE, pin: SUPER_PIN, branchId: run.branch_id, expected: run.expected },
    );
  });
});