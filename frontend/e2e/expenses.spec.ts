import { test, expect } from '@playwright/test';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';
const BRANCH_ID = '00000000-0000-0000-0000-000000000002';

test.describe('Expenses Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', SUPER_PHONE);
    await page.fill('input[type="password"]', SUPER_PIN);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('creates an expense from the dialog and shows it as pending', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.locator('h1')).toContainText('Expenses', { timeout: 10000 });

    await page.getByRole('button', { name: 'Add Expense' }).click();
    const dialog = page.locator('.p-dialog-mask');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const branchSelect = dialog.locator('p-select').first().locator('[role="combobox"]').first();
    await branchSelect.click();
    await page.waitForTimeout(300);
    const branchOption = page.locator('.p-select-option:has-text("Main Branch")').first();
    await expect(branchOption).toBeVisible({ timeout: 3000 });
    await branchOption.click();

    const amountInput = dialog.locator('input[inputmode="decimal"]').first();
    await amountInput.fill('75000');
    await dialog.locator('textarea').first().fill('e2e dialog expense');

    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Expense created')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('table').first().getByText('PENDING').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('table').first().getByText('e2e dialog expense').first()).toBeVisible();
  });

  test('full approve / reject / pay workflow is enforced', async ({ page }) => {
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

    const managerPhone = `25${Date.now().toString().slice(-7)}`;

    // Create an approver (manager) + get its PIN via reset-pin
    const managerPin = await page.evaluate(
      async ({ token, phone }) => {
        const create = await fetch('/api/v1/users/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ phone, name: 'Expense Approver', role: 'manager' }),
        });
        if (!create.ok) throw new Error(await create.text());
        const reset = await fetch(`/api/v1/users/${phone}/reset-pin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const body = await reset.json();
        if (!reset.ok) throw new Error(JSON.stringify(body));
        return body.new_pin as string;
      },
      { token, phone: managerPhone },
    );

    const managerToken = await page.evaluate(
      async ({ phone, pin }) => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        return (await res.json()).access_token;
      },
      { phone: managerPhone, pin: managerPin },
    );

    const result = await page.evaluate(
      async ({ token, managerToken, branchId }) => {
        const create = async (token: string, description: string) => {
          const res = await fetch('/api/v1/finance/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ branch_id: branchId, amount: 42000, description, category: 'fuel' }),
          });
          return (await res.json()) as { id: string };
        };
        const call = async (token: string, url: string, method = 'POST', body?: unknown) => {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          const text = await res.text();
          return { status: res.status, body: text ? (JSON.parse(text) as any) : undefined };
        };

        const e1 = await create(token, 'e2e approve flow');

        // Creator cannot approve own expense
        const selfApprove = await call(token, `/api/v1/finance/expenses/${e1.id}/approve`);
        const managerApprove = await call(managerToken, `/api/v1/finance/expenses/${e1.id}/approve`);
        const markPaid = await call(token, `/api/v1/finance/expenses/${e1.id}/mark-paid`);
        const deletePaid = await call(token, `/api/v1/finance/expenses/${e1.id}`, 'DELETE');

        const e2 = await create(token, 'e2e reject flow');
        const managerReject = await call(managerToken, `/api/v1/finance/expenses/${e2.id}/reject`, 'POST', { rejection_reason: 'missing receipt' });
        const deleteRejected = await call(token, `/api/v1/finance/expenses/${e2.id}`, 'DELETE');

        return {
          selfApprove: selfApprove.status,
          approvedStatus: managerApprove.body.status,
          approvedBy: managerApprove.body.approved_by,
          paidStatus: markPaid.body.status,
          deletePaid: deletePaid.status,
          rejectedStatus: managerReject.body.status,
          rejectionReason: managerReject.body.rejection_reason,
          deleteRejected: deleteRejected.status,
        };
      },
      { token, managerToken, branchId: BRANCH_ID },
    );

    expect(result.selfApprove).toBe(403);
    expect(result.approvedStatus).toBe('approved');
    expect(result.approvedBy).toBe(managerPhone);
    expect(result.paidStatus).toBe('paid');
    expect(result.deletePaid).toBe(409);
    expect(result.rejectedStatus).toBe('rejected');
    expect(result.rejectionReason).toBe('missing receipt');
    expect(result.deleteRejected).toBe(204);

    // Cleanup: remove the approver user
    await page.evaluate(
      async ({ token, phone }) => {
        await fetch(`/api/v1/users/${phone}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      },
      { token, phone: managerPhone },
    );
  });
});
