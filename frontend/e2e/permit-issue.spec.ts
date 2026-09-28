import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';
const BRANCH_ID = '00000000-0000-0000-0000-000000000002';
const PRODUCT = '6fbd1fb8-3997-4b5e-8ecb-aba5d7bec58c';
const PACKAGE = 'd2857f8b-6118-4206-8fbd-857a39667fb6';
/** The package's full price — the payment total is set from the package, not
 *  from the allocation, so a "fully paid" client must pay the whole thing. */
const PACKAGE_PRICE = 610000;

async function apiToken(page: Page) {
  return page.evaluate(
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
}

async function makeClient(
  page: Page,
  token: string,
  opts: { first: string; paid: number; testedOn?: string },
) {
  return page.evaluate(
    async ({ token, branchId, product, pkg, first, paid, testedOn }) => {
      const phone = `25672${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
      const res = await fetch('/api/v1/consultations/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          phone,
          first_name: first,
          last_name: 'Permit Probe',
          location: 'Kampala',
          branch_id: branchId,
          // The payment total always becomes the package price, while the paid
          // amount follows the allocation — so a smaller allocation is how we
          // build a client who still owes money.
          items: [{ product_id: product, package_id: pkg, allocation: paid }],
          payment: { receipt_number: `IP-${phone}`, amount: paid },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const c = await res.json();
      const d = await (await fetch(`/api/v1/consultations/${c.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })).json();
      const cartItemId = d.cart_items[0].id as string;
      if (testedOn) {
        await fetch(`/api/v1/cart-items/${cartItemId}/permit-progress`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ tested_on_date: testedOn }),
        });
      }
      return { consultationId: c.id as string, cartItemId, clientName: `${first} Permit Probe` };
    },
    {
      token, branchId: BRANCH_ID, product: PRODUCT, pkg: PACKAGE,
      first: opts.first, paid: opts.paid, testedOn: opts.testedOn,
    },
  );
}

async function cleanup(page: Page, token: string, consultationId: string) {
  await page.evaluate(
    async ({ token, id }) => {
      await fetch('/api/v1/consultations/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids: [id] }),
      });
    },
    { token, id: consultationId },
  );
}

async function openIssueDialog(page: Page, clientName: string) {
  await page.goto('/permits');
  await page.fill('input[placeholder*="Search by name"]', clientName);
  await page.locator('input[placeholder*="Search by name"]').press('Enter');
  await page.waitForTimeout(1200);
  const row = page.locator('table tbody tr').filter({ hasText: clientName }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('[data-testid="issue-permit"]').click();
  // The <p-dialog> host is itself hidden; the real surface is the inner .p-dialog.
  const dlg = page
    .locator('.p-dialog')
    .filter({ has: page.locator('.p-dialog-header:has-text("Issue Permit")') })
    .last();
  await expect(dlg).toBeVisible({ timeout: 10000 });
  return dlg;
}

test.describe('Permit issue', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('a permit expense with no amount cannot be filed', async ({ page }) => {
    const token = await apiToken(page);
    const fx = await makeClient(page, token, { first: 'Zero', paid: PACKAGE_PRICE });

    await page.goto(`/consultations/${fx.consultationId}`);
    await page.getByRole('button', { name: 'Permit', exact: true }).click();

    const checklist = page.getByTestId('permit-expense-checklist');
    await expect(checklist).toBeVisible({ timeout: 15000 });
    const card = checklist.getByTestId('permit-expense-permit_payment');
    await expect(card).toBeVisible();

    // No expected amount is configured for this package, so the prefill is
    // blank: the File button is disabled with an explanation.
    const fileHost = card.getByTestId('file-permit_payment');
    const fileBtn = fileHost.locator('button');
    await expect(fileBtn).toBeDisabled();
    await expect(card.getByTestId('amount-required-permit_payment')).toBeVisible();

    // Typing a positive amount enables it.
    const amountInput = card.locator('input[inputmode="decimal"]').first();
    await amountInput.click();
    await amountInput.pressSequentially('200000');
    await expect(fileBtn).toBeEnabled();

    // Zero disables it again.
    await amountInput.fill('');
    await amountInput.pressSequentially('0');
    await expect(fileBtn).toBeDisabled();

    // And the API refuses a zero filing even if the UI is bypassed.
    const rejected = await page.evaluate(
      async ({ token, cartItemId, branchId }) => {
        const res = await fetch('/api/v1/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            amount: 0, category: 'Permit Payment', cart_item_id: cartItemId, branch_id: branchId,
          }),
        });
        return { status: res.status, body: await res.text() };
      },
      { token, cartItemId: fx.cartItemId, branchId: BRANCH_ID },
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body).toContain('greater than zero');

    await cleanup(page, token, fx.consultationId);
  });

  test('issuing is blocked while the client still owes money', async ({ page }) => {
    const token = await apiToken(page);
    const fx = await makeClient(page, token, { first: 'Owes', paid: 400000, testedOn: '2026-08-20' });

    const readiness = await page.evaluate(
      async ({ token, cartItemId }) => {
        const res = await fetch(`/api/v1/cart-items/${cartItemId}/permit-issue-readiness`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.json();
      },
      { token, cartItemId: fx.cartItemId },
    );
    expect(readiness.outstanding_balance).toBe(210000);
    expect(readiness.has_zero_balance).toBe(false);
    expect(readiness.can_issue).toBe(false);
    expect(readiness.blockers.join(' ')).toContain('Clear the balance');

    // The API refuses issuance too.
    const refused = await page.evaluate(
      async ({ token, cartItemId }) => {
        const res = await fetch(`/api/v1/cart-items/${cartItemId}/permit-issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ issued_date: '2026-09-04' }),
        });
        return { status: res.status, body: await res.text() };
      },
      { token, cartItemId: fx.cartItemId },
    );
    expect(refused.status).toBe(400);
    expect(refused.body).toContain('Clear the balance');

    const dlg = await openIssueDialog(page, fx.clientName);
    await expect(dlg.getByTestId('issue-balance')).toContainText('210,000');
    await expect(dlg.getByTestId('issue-submit').locator('button')).toBeDisabled();
    await expect(dlg.getByTestId('issue-blocked')).toContainText('outstanding balance');

    await cleanup(page, token, fx.consultationId);
  });

  test('issuing a fully-paid client defaults to 15 days after the test', async ({ page }) => {
    const token = await apiToken(page);
    const fx = await makeClient(page, token, {
      first: 'Ready', paid: PACKAGE_PRICE, testedOn: '2026-08-20',
    });

    const readiness = await page.evaluate(
      async ({ token, cartItemId }) => {
        const res = await fetch(`/api/v1/cart-items/${cartItemId}/permit-issue-readiness`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.json();
      },
      { token, cartItemId: fx.cartItemId },
    );
    expect(readiness.has_zero_balance).toBe(true);
    expect(readiness.can_issue).toBe(true);
    // tested_on 2026-08-20 + 15 days
    expect(readiness.suggested_issue_date).toBe('2026-09-04');

    const dlg = await openIssueDialog(page, fx.clientName);
    await expect(dlg.getByTestId('issue-balance')).toContainText('Balance cleared');
    const dateInput = dlg.getByTestId('issue-date').locator('input').first();
    await expect(dateInput).toHaveValue('04/09/2026');
    const submit = dlg.getByTestId('issue-submit').locator('button');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dlg).toBeHidden({ timeout: 10000 });

    const tracker = await page.evaluate(
      async ({ token, cartItemId }) => {
        const list = await (await fetch('/api/v1/permits/?page_size=100&search=Ready', {
          headers: { 'Authorization': `Bearer ${token}` },
        })).json();
        return (list.trackers ?? []).find((t: any) => t.cart_item_id === cartItemId) ?? null;
      },
      { token, cartItemId: fx.cartItemId },
    );
    expect(tracker.status).toBe('permit_received');
    expect(String(tracker.permit_received_date)).toContain('2026-09-04');

    // Issuing again is a no-op the API still accepts (idempotent date write).
    const progress = await page.evaluate(
      async ({ token, cartItemId }) => {
        const res = await fetch(`/api/v1/cart-items/${cartItemId}/permit-progress`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.json();
      },
      { token, cartItemId: fx.cartItemId },
    );
    expect(String(progress.permit_received_date)).toContain('2026-09-04');

    await cleanup(page, token, fx.consultationId);
  });
});
