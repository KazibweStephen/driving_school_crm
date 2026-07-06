import { test, expect } from '@playwright/test';

const SUPER_PHONE = '256700000000';
const SUPER_PIN = '1234';

test.describe('Vehicle & Dual-Phase Scheduling', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/login');
    await page.fill('#phone', SUPER_PHONE);
    await page.fill('input[type="password"]', SUPER_PIN);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('creates lesson plan with dual-phase vehicles and locks schedule via API', async ({ page }) => {
    const token = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '256700000000', pin: '1234' }),
      });
      return (await res.json()).access_token;
    });

    const ts = Date.now();

    // 1. Create lesson plan template
    const template = await page.evaluate(async ({ token, ts }) => {
      const res = await fetch('/api/v1/lesson-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `Dual-Phase Template ${ts}`,
          transmission_type: 'both',
          total_days: 10, total_weeks: 2,
          items: Array.from({ length: 10 }, (_, i) => ({
            day_number: i + 1,
            week_number: Math.floor(i / 5) + 1,
            title: `Lesson ${i + 1}`,
            order: i + 1,
          })),
        }),
      });
      return res.json();
    }, { token, ts });

    // 2. Create manual vehicle
    const manVeh = await page.evaluate(async ({ token, ts }) => {
      const res = await fetch('/api/v1/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `Manual-${ts}`, plate_number: `MAN${ts}`, transmission: 'manual' }),
      });
      return res.json();
    }, { token, ts });

    // 3. Create auto vehicle
    const autoVeh = await page.evaluate(async ({ token, ts }) => {
      const res = await fetch('/api/v1/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `Auto-${ts}`, plate_number: `AUT${ts}`, transmission: 'automatic' }),
      });
      return res.json();
    }, { token, ts });

    // 4. Create instructor
    const instPhone = `2567${ts.toString().slice(-7)}`;
    await page.evaluate(async ({ token, phone }) => {
      await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, name: 'Dual-Phase Instructor', role: 'instructor', pin: '1234' }),
      });
    }, { token, phone: instPhone });

    // 5. Create product with training package (separate calls)
    const product = await page.evaluate(async ({ token, ts }) => {
      const res = await fetch('/api/v1/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `Training-${ts}` }),
      });
      return res.json();
    }, { token, ts });

    const pkg = await page.evaluate(async ({ token, product }) => {
      const res = await fetch('/api/v1/packages/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: product.id,
          name: '10-Day',
          price: 500000,
          requires_driving_training: true,
          driving_training_duration_days: 10,
        }),
      });
      return res.json();
    }, { token, product });

    // 6. Create consultation and then add cart item (two steps, avoiding full endpoint response issue)
    const phone = `2567${(ts + 1).toString().slice(-7)}`;
    const consultation = await page.evaluate(async ({ token, phone }) => {
      const res = await fetch('/api/v1/consultations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, first_name: 'Dual', last_name: 'Phase', location: 'Kampala' }),
      });
      return res.json();
    }, { token, phone });

    // Add cart item
    const cartItem = await page.evaluate(async ({ token, consultation, product, pkg }) => {
      const res = await fetch(`/api/v1/consultations/${consultation.id}/cart-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: product.id, package_id: pkg.id }),
      });
      return res.json();
    }, { token, consultation, product, pkg });

    const cartItemId = cartItem.id;
    expect(cartItemId).toBeDefined();

    // 7. Create client lesson plan with manual_days=4
    const plan = await page.evaluate(async ({ token, cartItemId, template }) => {
      const res = await fetch(`/api/v1/cart-items/${cartItemId}/lesson-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ template_id: template.id, transmission_type: 'both', manual_days: 4 }),
      });
      return res.json();
    }, { token, cartItemId, template });

    expect(plan.id).toBeDefined();
    expect(plan.manual_days).toBe(4);
    expect(plan.lessons.length).toBe(10);

    // 8. Lock schedule via API with dual-phase vehicles
    const lockResult = await page.evaluate(async ({ token, plan, manVeh, autoVeh, instPhone }) => {
      // Set instructor schedule — 17:00 slot for manual vehicle
      await fetch(`/api/v1/vehicle-schedule/${manVeh.id}/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify([{
          vehicle_id: manVeh.id,
          instructor_id: instPhone,
          day_of_week: 0, // Monday
          start_time: '17:00',
          end_time: '17:30',
        }]),
      });
      // Auto vehicle with same instructor
      await fetch(`/api/v1/vehicle-schedule/${autoVeh.id}/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify([{
          vehicle_id: autoVeh.id,
          instructor_id: instPhone,
          day_of_week: 0,
          start_time: '17:00',
          end_time: '17:30',
        }]),
      });

      // Lock schedule with manual days override=4
      const lock = await fetch(`/api/v1/lesson-plans/${plan.id}/lock-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          start_time: '17:00',
          instructor_id: instPhone,
          vehicle_id: manVeh.id,
          instructor_id_auto: instPhone,
          vehicle_id_auto: autoVeh.id,
          start_date: '2026-07-13', // Monday
          manual_days: 4,
        }),
      });
      return lock.json();
    }, { token, plan, manVeh, autoVeh, instPhone });

    expect(lockResult.locked).toBeGreaterThan(0);

    // 9. Fetch updated plan and verify vehicle assignments
    const updatedPlan = await page.evaluate(async ({ token, plan }) => {
      const res = await fetch(`/api/v1/lesson-plans/${plan.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    }, { token, plan });

    // Days 1-4 should have manual vehicle
    for (let i = 0; i < 4; i++) {
      expect(updatedPlan.lessons[i].vehicle_id).toBe(manVeh.id);
    }
    // Days 5-10 should have auto vehicle
    for (let i = 4; i < 10; i++) {
      expect(updatedPlan.lessons[i].vehicle_id).toBe(autoVeh.id);
    }

    // 10. Verify instructor propagation on all lessons
    for (const lesson of updatedPlan.lessons) {
      expect(lesson.instructor_id).toBe(instPhone);
    }

    // 11. Update cart item status to converted so it shows in Lesson Plans tab
    await page.evaluate(async ({ token, cartItem }) => {
      await fetch(`/api/v1/cart-items/${cartItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'converted_paid' }),
      });
    }, { token, cartItem });

    // 12. Navigate to consultation profile and verify UI shows the plan details
    await page.goto(`/consultations/${consultation.id}`);
    await page.waitForTimeout(2000);

    // Click "Lesson Plans" tab to see the plan card
    await page.getByRole('button', { name: 'Lesson Plans' }).click();
    await page.waitForTimeout(1000);

    // Should see the plan card showing "4 manual days"
    await expect(page.locator('text=4 manual days').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Locked at 17:00').first()).toBeVisible({ timeout: 5000 });

    // Clean up
    await page.evaluate(async ({ token, manVeh, autoVeh, instPhone, product, pkg, template, consultation, cartItem }) => {
      await fetch(`/api/v1/vehicles/${manVeh.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`/api/v1/vehicles/${autoVeh.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`/api/v1/users/${instPhone}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`/api/v1/packages/${pkg.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`/api/v1/products/${product.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      // Delete the lesson plan first, then the consultation
      const plansRes = await fetch(`/api/v1/cart-items/${cartItem.id}/lesson-plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const plans = await plansRes.json();
      for (const p of plans) {
        await fetch(`/api/v1/lesson-plans/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      }
      await fetch(`/api/v1/consultations/${consultation.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`/api/v1/lesson-plan-templates/${template.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }, { token, manVeh, autoVeh, instPhone, product, pkg, template, consultation, cartItem });
  });
});
