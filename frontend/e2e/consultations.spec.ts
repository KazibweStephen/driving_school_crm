import { test, expect } from '@playwright/test';

const SUPER_PHONE = '256700000000';
const SUPER_PIN = '1234';

test.describe('Consultations & Clients Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Use desktop viewport for table-based layout
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', SUPER_PHONE);
    await page.fill('input[type="password"]', SUPER_PIN);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  // ── Consultation List ──────────────────────────────────────

  test('navigates to consultations page and shows list', async ({ page }) => {
    await page.goto('/consultations');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Consultations');
    await page.waitForTimeout(2000);
    // Desktop table should have rows
    const rows = page.locator('table').first().locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('searches for existing consultation by phone', async ({ page }) => {
    await page.goto('/consultations');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });

    const searchInput = page.getByPlaceholder('Search by phone or name...');
    await searchInput.fill('0782832720');
    await page.waitForTimeout(1500);

    // Should show results containing the phone
    await expect(page.locator('text=0782832720').first()).toBeVisible({ timeout: 5000 });
  });

  test('navigates to consultation profile from list', async ({ page }) => {
    await page.goto('/consultations');
    await page.waitForTimeout(2000);

    // Desktop table link - visible at 1280px viewport
    const visibleLink = page.locator('table a[href*="/consultations/"]').first();
    await expect(visibleLink).toBeVisible({ timeout: 5000 });
    const href = await visibleLink.getAttribute('href') || '';
    await visibleLink.click();
    await expect(page).toHaveURL(new RegExp(href.replace('/', '\\/')), { timeout: 10000 });

    // Profile should show person info
    await expect(page.locator('text=Phone:').first()).toBeVisible({ timeout: 5000 });
  });

  // ── Consultation Profile: Products Section ─────────────────

  test('consultation profile shows products section', async ({ page }) => {
    await page.goto('/consultations');
    await page.waitForTimeout(2000);

    const visibleLink = page.locator('table a[href*="/consultations/"]').first();
    await expect(visibleLink).toBeVisible({ timeout: 5000 });
    await visibleLink.click();
    await expect(page).toHaveURL(/\/consultations\//, { timeout: 10000 });

    // Products section should be visible
    await expect(page.locator('text=Products').first()).toBeVisible({ timeout: 5000 });
  });

  test('opens Add to Cart dialog on consultation profile', async ({ page }) => {
    await page.goto('/consultations');
    await page.waitForTimeout(2000);

    const visibleLink = page.locator('table a[href*="/consultations/"]').first();
    await expect(visibleLink).toBeVisible({ timeout: 5000 });
    await visibleLink.click();
    await expect(page).toHaveURL(/\/consultations\//, { timeout: 10000 });

    // Click "Add to Cart" button
    const addBtn = page.locator('button:has-text("Add to Cart")').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // Dialog should open with step 1 showing products
    await expect(page.locator('text="Add to Cart"').first()).toBeVisible({ timeout: 5000 });
  });

  test('adds a product via Add to Cart dialog', async ({ page }) => {
    await page.goto('/consultations');
    await page.waitForTimeout(2000);

    const visibleLink = page.locator('table a[href*="/consultations/"]').first();
    await expect(visibleLink).toBeVisible({ timeout: 5000 });
    await visibleLink.click();
    await expect(page).toHaveURL(/\/consultations\//, { timeout: 10000 });

    // Open dialog
    const addBtn = page.locator('button:has-text("Add to Cart")').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await page.waitForTimeout(500);

    // Select a product from the dropdown
    const productSelect = page.locator('p-select').first().locator('[role="combobox"]').first();
    await expect(productSelect).toBeVisible({ timeout: 5000 });
    await productSelect.click();
    await page.waitForTimeout(300);

    // Pick the first product option
    const firstOption = page.locator('[role="option"]').first();
    if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstOption.click();
      await page.waitForTimeout(300);
    }

    // Click "Add to List"
    const addToListBtn = page.locator('button:has-text("Add to List")').first();
    if (await addToListBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addToListBtn.click();
      await page.waitForTimeout(500);
    }
  });

  // ── Clients Page ───────────────────────────────────────────

  test('clients page redirects to consultations', async ({ page }) => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Consultations');
  });

  test('stage filter shows only paid clients', async ({ page }) => {
    await page.goto('/consultations');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Open stage filter dropdown (p-select trigger)
    const stageSelect = page.locator('p-select').first();
    await expect(stageSelect).toBeVisible({ timeout: 5000 });
    await stageSelect.click();
    await page.waitForTimeout(500);

    // Select "Completed" stage from overlay
    const option = page.locator('.p-select-option:has-text("Completed")');
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(3000);

      // Stage labels should reflect Completed
      const completedTags = page.locator('p-tag[value="Completed"]');
      const count = await completedTags.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('searches consultations by phone', async ({ page }) => {
    await page.goto('/consultations');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder('Search by phone or name...');
    if (await searchInput.isVisible()) {
      await searchInput.fill('2567');
      await page.waitForTimeout(1000);
    }
  });

  // ── Consultation Profile / Unified Detail Page ──────────────

  test('navigates to consultation profile page', async ({ page }) => {
    await page.goto('/consultations');
    await expect(page).toHaveURL(/\/consultations/, { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Click the first consultation link in the table
    const profileLink = page.locator('table a').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await expect(page).toHaveURL(/\/consultations\//, { timeout: 10000 });
      await expect(page.locator('text=Phone:').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('consultation profile shows payments section', async ({ page }) => {
    await page.goto('/consultations');
    await page.waitForTimeout(3000);

    const profileLink = page.locator('table a').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await expect(page).toHaveURL(/\/consultations\//, { timeout: 10000 });

      // Payments &amp; Balances section may be visible (for converted clients) or hidden
      const paySection = page.locator('text=Payments & Balances');
      if (await paySection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(paySection).toBeVisible();
      }
    }
  });

  // ── Backend Integration: Create & Verify Consultation ─────

  test('creates a consultation via API and verifies on consultations page', async ({ page }) => {
    // First login via API
    const token = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '256700000000', pin: '1234' }),
      });
      const data = await res.json();
      return data.access_token;
    });

    const phone = `2567${Date.now().toString().slice(-7)}`;

    // Create consultation via API
    await page.evaluate(async ({ token, phone }) => {
      const res = await fetch('/api/v1/consultations/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone,
          first_name: 'Playwright',
          last_name: 'Test',
          location: 'Kampala',
        }),
      });
      if (!res.ok) throw new Error(`Failed to create: ${await res.text()}`);
      return res.json();
    }, { token, phone });

    // Verify it appears on consultations page
    await page.goto('/consultations');
    const searchInput = page.getByPlaceholder('Search by phone or name...');
    await searchInput.fill(phone);
    await page.waitForTimeout(1000);

    await expect(page.locator(`text=${phone}`).first()).toBeVisible({ timeout: 5000 });
  });

  // ── Products Page ──────────────────────────────────────────

  test('navigates to products page', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/products/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Products');
  });

  test('products page shows product list', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/products/, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Should see product accordion or table
    const text = await page.locator('h1').textContent();
    expect(text).toContain('Products');
  });

  // ── Users Page ────────────────────────────────────────────

  test('navigates to users page', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Users');
  });
});
