import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test('web onboarding: readonly installments + step4 receipt/view-client buttons', async ({ page }) => {
  const apiLog: string[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/v1/')) {
      let body = '';
      try { body = await res.text(); } catch { body = '<err>'; }
      apiLog.push(`${res.status()} ${res.request().method()} ${url} => ${body.slice(0, 600)}`);
    }
  });
  await loginSuperAdmin(page);
  await page.goto('/consultations');
  const ts = Date.now().toString().slice(-6);
  const phone = `0788Z${ts}`;

  // search for a new phone -> no results -> Create Consultation appears
  await page.getByPlaceholder('Search by phone or name...').fill(phone);
  await page.getByRole('button', { name: 'Create Consultation' }).first().click();
  const dialog = page.getByRole('dialog');

  // Step 1
  await dialog.locator('input').nth(1).fill('Onboard');
  await dialog.getByRole('button', { name: 'Next: Add Products' }).click();

  // Step 2: pick product + package, add
  await dialog.getByText('Select product').first().click();
  await page.getByRole('option').first().click();
  await dialog.getByText('Select package').first().click();
  await page.getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Add Product' }).click();
  await dialog.getByLabel('Convert Now (process payment)').check();
  await dialog.getByRole('button', { name: 'Next: Payment' }).click();

  // Step 3: enter a partial pay-now amount (first p-inputnumber)
  await expect(dialog.getByText('Allocate payment')).toBeVisible();
  const payNow = dialog.locator('p-inputnumber input').first();
  await payNow.click();
  await payNow.pressSequentially('1000');

  // Future installments appear (auto-split). Amount must be readonly, date min today.
  const instAmount = dialog.locator('p-inputnumber input').nth(1);
  await expect(instAmount).toBeVisible();
  const attr = await instAmount.getAttribute('readonly');
  console.log('installment amount readonly attr =', JSON.stringify(attr));

  // Complete payment (no receipt number)
  await dialog.getByRole('button', { name: 'Complete Payment' }).click();

  // Step 4: buttons
  await expect(dialog.getByText('Payment Receipts')).toBeVisible();
  const viewReceipt = dialog.getByRole('button', { name: /View Receipt|Receipt 1/ });
  const viewClient = dialog.getByRole('button', { name: 'View Client' });
  const close = dialog.getByRole('button', { name: 'Close' });
  console.log('View Client count:', await viewClient.count());
  console.log('View Receipt/Receipt 1 count:', await viewReceipt.count());
  console.log('Close count:', await close.count());
  console.log('API LOG:\n' + apiLog.join('\n'));
});
