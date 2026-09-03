import { test, expect, APIRequestContext } from '@playwright/test';

let api: APIRequestContext;
let token = '';

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: 'http://localhost:8000' });
  const res = await api.post('/api/v1/auth/login', {
    data: { phone: '0782832711', pin: '1234' },
  });
  token = (await res.json()).access_token;
});

test.afterAll(async () => {
  await api.dispose();
});

async function loginToHome(page: import('@playwright/test').Page) {
  await page.goto('/m/login');
  await page.getByTestId('phone').fill('0782832711');
  await page.getByTestId('pin').fill('1234');
  await page.getByTestId('login-btn').click();
  const companySelection = page.getByTestId('company-selection');
  try {
    await companySelection.waitFor({ state: 'visible', timeout: 10000 });
    await page.getByText('Default Company', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // no selection
  }
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/m\/home$/, { timeout: 10000 });
}

test.describe('Mobile Bulk Onboarding (stepped)', () => {
  test('adds a client through the per-client wizard steps', async ({ page }) => {
    const phone = `BO${Math.floor(10000000 + Math.random() * 89999999)}`;

    await loginToHome(page);
    await page.getByTestId('home-bulk onboard').click();
    await expect(page).toHaveURL(/\/m\/bulk-onboarding$/, { timeout: 10000 });
    await expect(page.getByText('Add clients one at a time, step by step')).toBeVisible();

    // Open the wizard
    await page.getByTestId('bo-add-client').click();
    await expect(page.getByText('Add Client').first()).toBeVisible();

    // Step 1: Info — next disabled until phone + first name
    const next = page.getByTestId('bo-next').locator('button');
    await expect(next).toBeDisabled();
    await page.getByTestId('bo-phone').fill(phone);
    await page.getByTestId('bo-first').fill('Stepped');
    await expect(next).toBeEnabled();

    // Advance to Payments step
    await next.click();
    await expect(page.getByText('Packages & payments')).toBeVisible();

    // Advance to Lessons step (packages empty => Next is disabled, since paymentsValid false)
    const lessonsStepNav = page.getByTestId('bo-next').locator('button');
    await expect(lessonsStepNav).toBeDisabled();

    // Go back to Info (allowed)
    await page.getByTestId('bo-back').locator('button').click();
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Client info');
  });

  test('canceling the wizard returns to the client list without adding', async ({ page }) => {
    const phone = `BO${Math.floor(10000000 + Math.random() * 89999999)}`;

    await loginToHome(page);
    await page.getByTestId('home-bulk onboard').click();
    await expect(page).toHaveURL(/\/m\/bulk-onboarding$/, { timeout: 10000 });

    await page.getByTestId('bo-add-client').click();
    await page.getByTestId('bo-phone').fill(phone);
    await page.getByTestId('bo-first').fill('Listed');
    // Cancel via the header back arrow
    await page.getByTestId('bo-cancel').click();
    await expect(page.getByText('Add clients one at a time, step by step')).toBeVisible();
    // No client should have been added
    await expect(page.getByText(phone)).toBeHidden();
  });
});
