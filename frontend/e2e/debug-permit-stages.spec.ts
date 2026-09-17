import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

async function createTracker(page: Page): Promise<{ consultId: string; cartItemId: string; phone: string }> {
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  const phone = `70${Date.now().toString().slice(-8)}`;
  return await page.evaluate(async ({ tok, phone }) => {
    const bres = await fetch('/api/v1/companies/my-branches', {
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    const branch = (await bres.json())[0];
    const res = await fetch('/api/v1/consultations/full', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
      body: JSON.stringify({
        phone, first_name: 'Permit', last_name: 'Test', location: 'Kampala',
        branch_id: branch.id,
        items: [{ product_id: '6fbd1fb8-3997-4b5e-8ecb-aba5d7bec58c', package_id: 'd2857f8b-6118-4206-8fbd-857a39667fb6', allocation: 1000 }],
        payment: { receipt_number: `R-${Date.now()}` },
      }),
    });
    if (!res.ok) throw new Error(`create consultation ${res.status} ${await res.text()}`);
    const created = await res.json();
    const cref = await fetch(`/api/v1/consultations/${created.id}`, {
      headers: { 'Authorization': `Bearer ${tok}` },
    });
    const consult = await cref.json();
    return { consultId: created.id, cartItemId: consult.cart_items?.[0]?.id, phone };
  }, { tok: token, phone });
}

async function openStagesFor(page: Page, phone: string) {
  await page.goto('/permits');
  await page.waitForSelector('h1:has-text("Permits")', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const searchInput = page.locator('input[placeholder*="Search by name"]');
  await searchInput.fill(phone);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  const row = page.locator('table tbody tr', { hasText: phone }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  const manageBtn = row.locator('button.p-button-warn');
  await expect(manageBtn).toBeVisible({ timeout: 5000 });
  await manageBtn.click();
  await expect(page.getByText('Stage Dates').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Audit Trail').first()).toBeVisible({ timeout: 10000 });
}

async function pickTodayOnDatepicker(page: Page, nth: number) {
  const input = page.locator('p-datepicker input').nth(nth);
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.click();
  await page.waitForTimeout(800);
  const todayCell = page.locator('td.p-datepicker-today').last();
  await expect(todayCell).toBeVisible({ timeout: 5000 });
  await todayCell.click();
  await page.waitForTimeout(600);
  console.log(`DATEPICKER[${nth}] VAL AFTER:`, await input.inputValue());
}

test('stage management dialog full UI flow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginSuperAdmin(page);
  await page.waitForTimeout(1500);

  const { consultId, cartItemId, phone } = await createTracker(page);
  expect(cartItemId).toBeTruthy();

  try {
    await openStagesFor(page, phone);

    await expect(page.getByText('Not Qualified').first()).toBeVisible();
    await expect(page.getByText('Permit Received').first()).toBeVisible();
    await expect(page.getByText(/50% of the package paid/).first()).toBeVisible();

    // Override eligibility: reason required
    await page.getByRole('button', { name: 'Override Eligibility' }).click();
    await expect(page.getByText('Reason required').first()).toBeVisible({ timeout: 8000 });

    const reasonInput = page.locator('input[placeholder="Reason (required)"]');
    await reasonInput.fill('Approved by manager, 60% will be paid in 2 days');
    await page.getByRole('button', { name: 'Override Eligibility' }).click();
    await expect(page.getByText(/Eligibility updated with audit trail/).first()).toBeVisible({ timeout: 8000 });

    const auditText = await page.locator('ul').last().innerText();
    expect(auditText).toContain('Eligibility');

    // Set issue date via calendar panel → suggests due date = +30d → Save
    await pickTodayOnDatepicker(page, 0);
    const dueInput = page.locator('p-datepicker input').nth(1);
    const dueVal = await dueInput.inputValue();
    console.log(`Due date suggested: "${dueVal}"`);
    await page.getByRole('button', { name: 'Save Dates' }).first().click();
    await expect(page.getByText('Permit dates updated').first()).toBeVisible({ timeout: 8000 });

    await page.waitForTimeout(1500);
    await page.goto('/permits');
    await page.waitForSelector('h1:has-text("Permits")', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const row = page.locator('table tbody tr', { hasText: phone }).first();
    const statusText = await row.innerText();
    console.log(`\n=== ROW STATUS for ${phone} ===\n${statusText}`);
    expect(statusText).toMatch(/Learners Active|Due for Testing/);

    await row.locator('button.p-button-warn').click();
    await expect(page.getByText('Stage Dates').first()).toBeVisible({ timeout: 10000 });
    const audit = await page.locator('ul').last().innerText();
    console.log(`=== AUDIT TAIL ===\n${audit}`);
    expect(audit).toContain('Learner\'s permit issue date');
  } finally {
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    await page.evaluate(async ({ tok, consultId }) => {
      const res = await fetch('/api/v1/consultations/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify({ ids: [consultId] }),
      });
      if (!res.ok) throw new Error(`cleanup ${res.status} ${await res.text()}`);
    }, { tok: token, consultId });
  }
});