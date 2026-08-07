import { Page, expect } from '@playwright/test';

const SUPER_PHONE = '0782832711';
const SUPER_PIN = '1234';

/**
 * Logs in as the super admin. If the post-login company-selection dialog appears
 * (super admin + more than one company), picks the given company (default:
 * Default Company) and continues to /dashboard.
 */
export async function loginSuperAdmin(
  page: Page,
  companyName = 'Default Company',
) {
  await page.goto('/login');
  await page.fill('#phone', SUPER_PHONE);
  await page.fill('input[type="password"]', SUPER_PIN);
  await page.getByRole('button', { name: 'Sign In' }).click();

  const dialog = page.getByText('Select Company', { exact: true });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText(companyName, { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No company selection dialog; proceed to dashboard
  }

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}
