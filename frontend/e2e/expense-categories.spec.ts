import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';

test.describe('Expense Categories', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
  });

  test('client dropdown shows for a requires_client category', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.locator('h1')).toContainText('Expenses', { timeout: 10000 });

    await page.getByRole('button', { name: 'Add Expense' }).click();
    const dialog = page.locator('.p-dialog-mask');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 2nd p-select is the Category dropdown; pick the seeded requires_client category
    const categorySelect = dialog.locator('p-select').nth(1).locator('[role="combobox"]').first();
    await categorySelect.click();
    await page.waitForTimeout(300);
    const permitOption = page.locator('.p-select-option:has-text("Permit Payment")').first();
    await expect(permitOption).toBeVisible({ timeout: 3000 });
    await permitOption.click();
    await page.waitForTimeout(500);

    await expect(page.getByPlaceholder(/search client by name or phone/i)).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText('Client *', { exact: true })).toBeVisible();
  });

  test('category CRUD + sync-used via API', async ({ page }) => {
    const token = await page.evaluate(
      async ({ phone, pin }) => {
        const base = location.origin;
        const res = await fetch(`${base}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        return (await res.json()).access_token;
      },
      { phone: SUPER_PHONE, pin: SUPER_PIN },
    );

    const call = async (method: string, url: string, body?: unknown) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? (JSON.parse(text) as any) : undefined };
    };

    const base = await page.evaluate(() => location.origin);
    const API = `${base}/api/v1/finance`;

    const stamp = Date.now().toString().slice(-6);
    const name = `E2E Cat ${stamp}`;

    // Create
    const created = await call('POST', `${API}/expense-categories`,
      { name, code: `e2e_cat_${stamp}`, requires_client: true, is_operating: false, account: 'client_accounts' });
    expect(created.status).toBe(201);
    expect(created.body.account).toBe('client_accounts');
    const id = created.body.id;

    // Update (change account)
    const updated = await call('PATCH', `${API}/expense-categories/${id}`, { is_active: false, account: 'petty_cash' });
    expect(updated.status).toBe(200);
    expect(updated.body.is_active).toBe(false);
    expect(updated.body.account).toBe('petty_cash');

    // List (include inactive) should contain it
    const listed = await call('GET', `${API}/expense-categories?include_inactive=true`);
    const found = listed.body.items.find((c: any) => c.id === id);
    expect(found).toBeTruthy();

    // Sync-used is idempotent and returns a created count
    const sync1 = await call('POST', `${API}/expense-categories/sync-used`, {});
    expect(sync1.status).toBe(200);
    expect(typeof sync1.body.created).toBe('number');
    const sync2 = await call('POST', `${API}/expense-categories/sync-used`, {});
    expect(sync2.body.created).toBe(0);

    // Delete
    const deleted = await call('DELETE', `${API}/expense-categories/${id}`);
    expect(deleted.status).toBe(204);
  });

  test('expense categories page is visible in nav and shows the account column', async ({ page }) => {
    await page.goto('/expense-categories');
    await expect(page.locator('h1')).toContainText('Expense Categories', { timeout: 10000 });
    const header = page.locator('p-table thead');
    await expect(header).toContainText('Account', { timeout: 5000 });
    // Seed categories include client_accounts ones
    await expect(page.locator('p-table tbody')).toContainText('Client Accounts', { timeout: 5000 });
  });

  test('expense with attached receipt uploads and links a viewable receipt', async ({ page }) => {
    const base = await page.evaluate(() => location.origin);

    const token = await page.evaluate(
      async ({ base, phone, pin }) => {
        const res = await fetch(`${base}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        return (await res.json()).access_token;
      },
      { base, phone: SUPER_PHONE, pin: SUPER_PIN },
    );

    // Upload a small fake PNG receipt (Blob built in-browser)
    const up = await page.evaluate(
      async ({ base, token }) => {
        const fd = new FormData();
        const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3]);
        fd.append('file', new Blob([bytes], { type: 'image/png' }), 'receipt.png');
        const res = await fetch(`${base}/api/v1/finance/expenses/upload-receipt`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
        return { status: res.status, body: await res.json() };
      },
      { base, token },
    );
    expect(up.status).toBe(200);
    const url = up.body.url;
    expect(url).toContain('/uploads/receipts/');

    const filename = url.split('/').pop();

    // Create an expense with the receipt attached
    const exp = await page.evaluate(
      async ({ base, token, url }) => {
        const res = await fetch(`${base}/api/v1/finance/expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            branch_id: '00000000-0000-0000-0000-000000000002',
            amount: 1200,
            category: 'e2e receipt expense',
            receipt_url: url,
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { base, token, url },
    );
    expect(exp.status).toBe(201);
    expect(exp.body.receipt_url).toBe(url);

    // The serve endpoint returns the file
    const serve = await page.evaluate(
      async ({ base, token, filename }) => {
        const res = await fetch(`${base}/api/v1/finance/expenses/receipts/${filename}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
      },
      { base, token, filename },
    );
    expect(serve.status).toBe(200);
    expect(serve.bytes).toBeGreaterThan(0);

    // Cleanup expense
    await page.evaluate(
      async ({ base, token, id }) => {
        await fetch(`${base}/api/v1/finance/expenses/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      },
      { base, token, id: exp.body.id },
    );
  });
});
