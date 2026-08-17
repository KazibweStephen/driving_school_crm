import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test('debug token and products', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginSuperAdmin(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check token
  const tokenInfo = await page.evaluate(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return { error: 'no token' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { company_id: payload.company_id, role: payload.role, sub: payload.sub };
  });
  console.log('Token:', tokenInfo);

  // Check products with this token
  const productInfo = await page.evaluate(async () => {
    const res = await fetch('/api/v1/products/?page_size=100');
    const data = await res.json();
    return { status: res.status, total: data.total, itemCount: data.items?.length || 0, first: data.items?.[0]?.name };
  });
  console.log('Products:', productInfo);
});
