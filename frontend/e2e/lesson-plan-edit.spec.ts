import { test, expect } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

test.describe('Lesson Plan Quick Generate & Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginSuperAdmin(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('edits lesson plan via Quick Gen', async ({ page }) => {
    const token = await page.evaluate(() => localStorage.getItem('access_token'));

    // 1. Get products with packages
    const productInfo = await page.evaluate(async (tok) => {
      const res = await fetch('/api/v1/products/?page_size=100', {
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      const data = await res.json();
      const products = data.products || [];
      const p = products.find((x: any) => x.packages?.some((pk: any) => pk.driving_training_duration_days > 0)) || products[0];
      const pkg = p.packages?.[0];
      return { productId: p.id, packageId: pkg?.id };
    }, token);
    expect(productInfo.packageId).toBeTruthy();

    // 2. Create consultation with payment
    const consultId = await page.evaluate(async ({ tok, r }) => {
      const phone = `25670${Date.now().toString().slice(-6)}`;
      const res = await fetch('/api/v1/consultations/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify({
          phone, first_name: 'Test', last_name: 'Lesson', location: 'Kampala',
          items: [{ product_id: r.productId, package_id: r.packageId, allocation: 500000 }],
          payment: { receipt_number: `R-${Date.now()}` },
        }),
      });
      if (!res.ok) throw new Error(`create consultation ${res.status} ${await res.text()}`);
      return (await res.json()).id;
    }, { tok: token, r: productInfo });

    // 3. Get cart item ID
    const cartItemId = await page.evaluate(async ({ tok, consultId }) => {
      const res = await fetch(`/api/v1/consultations/${consultId}`, {
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      const data = await res.json();
      return data.cart_items?.[0]?.id;
    }, { tok: token, consultId });
    expect(cartItemId).toBeTruthy();

    // 4. Get a practical template
    const templateId = await page.evaluate(async (tok) => {
      const res = await fetch('/api/v1/lesson-plan-templates', {
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      const data = await res.json();
      return data.length > 0 ? data[0].id : null;
    }, token);

    // 5. Create plan via API
    const planId = await page.evaluate(async ({ tok, cartItemId, templateId }) => {
      const body: any = { transmission_type: 'manual', manual_days: 5 };
      if (templateId) body.template_id = templateId;
      const res = await fetch(`/api/v1/cart-items/${cartItemId}/lesson-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`create plan ${res.status} ${await res.text()}`);
      return (await res.json()).id;
    }, { tok: token, cartItemId, templateId });
    expect(planId).toBeTruthy();

    // 6. Navigate to profile
    await page.goto(`/consultations/${consultId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 7. Click Lesson Plans tab
    const lessonPlansTab = page.getByRole('button', { name: 'Lesson Plans' });
    await lessonPlansTab.click({ timeout: 5000 }).catch(async () => {
      const tabs = page.locator('.flex.border-b button');
      const tabCount = await tabs.count();
      if (tabCount > 5) await tabs.nth(5).click();
    });
    await page.waitForTimeout(1500);

    // 8. Click the pencil button on the plan card (skip first = consultation edit)
    const allPencilBtns = page.locator('button:has(.pi-pencil)');
    const pencilCount = await allPencilBtns.count();
    let clicked = false;
    for (let i = 0; i < pencilCount; i++) {
      const btn = allPencilBtns.nth(i);
      const box = await btn.boundingBox().catch(() => null);
      if (box && box.y > 300) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    expect(clicked).toBeTruthy();
    await page.waitForTimeout(2000);

    // 9. Wait for the dialog header
    const dialogHeader = page.locator('text=Quick Generate Lessons').first();
    await expect(dialogHeader).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // 10. Set Start Date by typing directly into the input (dateFormat="yy-mm-dd")
    const startInput = page.locator('label:has-text("Start Date")').locator('..').locator('input').first();
    await expect(startInput).toBeVisible({ timeout: 5000 });
    await startInput.click();
    await page.waitForTimeout(300);
    // Triple-click to select all text, then type
    await startInput.click({ clickCount: 3 });
    await startInput.pressSequentially('2026-08-10', { delay: 30 });
    await page.waitForTimeout(300);
    // Click somewhere else to dismiss calendar and commit value
    await dialogHeader.click();
    await page.waitForTimeout(500);

    // 11. Set Last Date
    const lastInput = page.locator('label:has-text("Last Date")').locator('..').locator('input').first();
    await lastInput.click();
    await page.waitForTimeout(300);
    await lastInput.click({ clickCount: 3 });
    await lastInput.pressSequentially('2026-08-13', { delay: 30 });
    await page.waitForTimeout(300);
    await dialogHeader.click();
    await page.waitForTimeout(500);

    // Verify dates were set
    const startVal = await startInput.inputValue();
    const lastVal = await lastInput.inputValue();
    console.log(`Dates set: start="${startVal}" last="${lastVal}"`);

    // 12. Set practical days = 2
    const practicalInput = page.locator('label:has-text("Days Trained (Practical)")').locator('..').locator('input').first();
    await practicalInput.click({ force: true });
    await page.waitForTimeout(200);
    await practicalInput.fill('');
    await practicalInput.pressSequentially('2', { delay: 50 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'e2e/fixtures/config-filled.png', fullPage: true });

    // 13. Click Review
    const reviewBtn = page.getByRole('button', { name: 'Review' });
    await expect(reviewBtn).toBeVisible({ timeout: 3000 });
    await expect(reviewBtn).toBeEnabled({ timeout: 5000 });
    await reviewBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/fixtures/preview.png', fullPage: true });

    // 14. Click Save Lessons
    const saveBtn = page.getByRole('button', { name: 'Save Lessons' });
    await expect(saveBtn).toBeVisible({ timeout: 3000 });
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e/fixtures/after-save.png', fullPage: true });

    // 15. Verify lesson plan display after save
    const tags = page.locator('p-tag');
    const tagCount = await tags.count();
    const locked = page.locator('text=LOCKED');
    const lockedCount = await locked.count();
    const durations = page.locator('text=/\\d+min/');
    const durCount = await durations.count();

    console.log(`\n=== RESULT: tags=${tagCount} locked=${lockedCount} durations=${durCount} ===`);
    await page.screenshot({ path: 'e2e/fixtures/final.png', fullPage: true });

    expect(tagCount).toBeGreaterThan(0);
    expect(durCount).toBeGreaterThan(0);
  });
});
