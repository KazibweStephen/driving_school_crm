import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test('debug products API', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginSuperAdmin(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const token = await page.evaluate(() => localStorage.getItem('access_token'));

  // Debug products with token
  const result = await page.evaluate(async (tok) => {
    const res = await fetch('/api/v1/products/?page_size=100', {
      headers: { 'Authorization': `Bearer ${tok}` }
    });
    const text = await res.text();
    return { status: res.status, body: text.substring(0, 500) };
  }, token);
  console.log('Products response:', result);
});
