import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';

/** Fetches the report straight from the API so the assertions can be exact. */
async function apiReport(page: Page, period: string) {
  return page.evaluate(
    async ({ phone, pin, period }) => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const token = (await res.json()).access_token;
      const r = await fetch(`/api/v1/reports/period?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: r.status, body: await r.json() };
    },
    { phone: SUPER_PHONE, pin: SUPER_PIN, period },
  );
}

test.describe('Management (period) reports', () => {
  test.beforeEach(async ({ page }) => {
    await loginSuperAdmin(page);
  });

  test('sidebar entry loads the page and renders every period', async ({ page }) => {
    // The default viewport is 375px, so the sidebar is behind the hamburger.
    const toggle = page.getByLabel('Toggle menu');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
    await page.getByRole('link', { name: 'Period Reports' }).click();
    await expect(page).toHaveURL(/\/period-reports$/);
    await expect(page.getByRole('heading', { name: 'Management Reports' })).toBeVisible();

    // Every period renders a label plus the cash KPI set.
    for (const period of ['week', 'month', 'quarter', 'year']) {
      await page.getByTestId(`period-${period}`).click();
      await expect(page.getByTestId('total-cash')).toBeVisible();
      await expect(page.getByTestId('period-label')).not.toBeEmpty();
    }
  });

  test('expected/paid/collected KPI cards match the API totals', async ({ page }) => {
    const api = await apiReport(page, 'month');
    expect(api.status).toBe(200);
    const t = api.body.totals;
    const money = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

    await page.goto('/period-reports');
    await page.getByTestId('period-month').click();
    // the sales cohort (products sold inside the period)
    await expect(page.getByTestId('total-expected')).toContainText(money(t.total_expected));
    await expect(page.getByTestId('total-paid')).toContainText(money(t.total_paid));
    // the collection cohort (products sold before the period)
    await expect(page.getByTestId('expected-from-collection')).toContainText(
      money(t.expected_from_collection),
    );
    await expect(page.getByTestId('total-collected')).toContainText(money(t.total_collected));
    await expect(page.getByTestId('total-cash')).toContainText(money(t.total_cash_received));
  });

  test('paid + collected always equals total cash, for every period', async ({ page }) => {
    await page.goto('/period-reports');
    for (const period of ['week', 'month', 'quarter', 'year']) {
      const api = await apiReport(page, period);
      expect(api.status, `${period} should load`).toBe(200);
      const t = api.body.totals;
      // The two cohorts partition the cash received in the period.
      expect(t.total_paid + t.total_collected).toBeCloseTo(t.total_cash_received, 2);
      // You cannot collect more than the cohort was worth, or pay more than expected.
      expect(t.total_paid).toBeLessThanOrEqual(t.total_expected + 1);
      expect(t.total_collected).toBeLessThanOrEqual(t.expected_from_collection + 1);
      // Outstanding of the two cohorts cannot exceed what is outstanding overall.
      expect(t.sales_outstanding).toBeLessThanOrEqual(t.outstanding_total + 1);
      expect(t.collection_outstanding).toBeLessThanOrEqual(t.outstanding_total + 1);
      // Net cash = cash received - paid expenses.
      expect(t.net_cash).toBeCloseTo(t.total_cash_received - t.expenses_paid, 2);
      // Rates are percentages.
      expect(t.conversion_rate).toBeGreaterThanOrEqual(0);
      expect(t.conversion_rate).toBeLessThanOrEqual(100);
    }
  });

  test('target performance is driven by value sold, not by collections', async ({ page }) => {
    for (const period of ['week', 'month', 'quarter', 'year']) {
      const api = await apiReport(page, period);
      const { totals: t, goal: g } = api.body;
      // Attainment is measured on what was sold...
      expect(g.attained).toBeCloseTo(t.total_expected, 2);
      // ...so it must differ from a cash-based figure whenever the two diverge.
      expect(g.attained).not.toBeCloseTo(t.total_cash_received, 0);
      // Remains and status stay consistent with the sold value.
      if (g.target > 0) {
        expect(g.attainment_pct).toBeCloseTo((t.total_expected / g.target) * 100, 4);
        expect(g.remaining).toBeCloseTo(Math.max(0, g.target - t.total_expected), 2);
      }
    }
  });

  test('goal, outstanding and at-risk sections render', async ({ page }) => {
    await page.goto('/period-reports');
    await expect(page.getByTestId('goal-attainment')).toBeVisible();
    await expect(page.getByTestId('outstanding-total')).toBeVisible();
    await expect(page.getByTestId('at-risk-table')).toBeVisible();
    await expect(page.getByText('Clients Not Paid For 14+ Days')).toBeVisible();

    const api = await apiReport(page, 'month');
    await expect(page.getByTestId('at-risk-total')).toContainText(
      `${api.body.at_risk_total} client(s)`,
    );
  });

  test('period navigation moves to the previous period', async ({ page }) => {
    await page.goto('/period-reports');
    await page.getByTestId('period-month').click();
    const first = await page.getByTestId('period-label').textContent();
    await page.getByTestId('prev-period').click();
    await expect(page.getByTestId('period-label')).not.toHaveText(first ?? '');
    await page.getByTestId('current-period').click();
    await expect(page.getByTestId('period-label')).toHaveText(first ?? '');
  });

  test('a role without period_reports.view cannot open the page or the API', async ({ page }) => {
    const INSTRUCTOR_PHONE = '25672795172';

    // Reset the fixture instructor's PIN so the test is self-contained.
    // NOTE: the login account (super admin) and the reset TARGET are separate
    // arguments — resetting the login account would break every later test.
    const newPin = await page.evaluate(
      async ({ loginPhone, loginPin, targetPhone }) => {
        const login = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: loginPhone, pin: loginPin }),
        });
        const token = (await login.json()).access_token;
        const res = await fetch(`/api/v1/users/${targetPhone}/reset-pin`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        return (await res.json()).new_pin;
      },
      { loginPhone: SUPER_PHONE, loginPin: SUPER_PIN, targetPhone: INSTRUCTOR_PHONE },
    );

    // The API refuses the report for this role.
    const apiStatus = await page.evaluate(
      async ({ phone, pin }) => {
        const login = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, pin }),
        });
        const token = (await login.json()).access_token;
        const r = await fetch('/api/v1/reports/period?period=month', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.status;
      },
      { phone: INSTRUCTOR_PHONE, pin: newPin },
    );
    expect(apiStatus).toBe(403);

    // ... and the sidebar entry is hidden, so the route is unreachable.
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await page.fill('#phone', INSTRUCTOR_PHONE);
    await page.fill('input[type="password"]', newPin);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/(dashboard|consultations|lesson-plans|vehicles|products|expenses|no-access)/, {
      timeout: 15000,
    });

    const toggle = page.getByLabel('Toggle menu');
    if (await toggle.isVisible().catch(() => false)) await toggle.click();
    await expect(page.getByRole('link', { name: 'Period Reports' })).toHaveCount(0);
  });
});
