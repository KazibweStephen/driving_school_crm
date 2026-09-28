import { test, expect, Page } from '@playwright/test';
import { loginSuperAdmin } from './helpers';

const BRANCH = '00000000-0000-0000-0000-000000000002'; // Main Branch
const PRODUCT_ID = '00b422b9-ace3-4728-b679-4abe03c34ea7';
const PACKAGE_ID = '77a7f143-7b2a-46db-98cf-be5cf73c33f0';

/** Creates a client at `branchId` that holds `paid` of real collected money. */
async function makeClient(page: Page, branchId: string, tag: string, paid: number) {
  return page.evaluate(
    async ({ branchId, tag, paid, PRODUCT_ID, PACKAGE_ID }) => {
      const tok = (await (
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
        })
      ).json()).access_token;
      const h = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      };
      const phone = `2569${tag}`;  // tag already carries the 1/2 suffix
      const cons = await (
        await fetch('/api/v1/consultations/full', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            phone,
            first_name: `Acc${tag}`,
            last_name: 'Fund',
            branch_id: branchId,
            items: [
              {
                product_id: PRODUCT_ID,
                package_id: PACKAGE_ID,
                allocation: 0,
              },
            ],
          }),
        })
      ).json();
      if (!cons.id) throw new Error(`consultation failed: ${JSON.stringify(cons)}`);
      // Record a collection so the account holds real client money.
      const pmt = await (
        await fetch(`/api/v1/consultations/${cons.id}/payments/collect`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            amount: paid,
            product_id: PRODUCT_ID,
            package_id: PACKAGE_ID,
            branch_id: branchId,
            payment_method: 'cash',
          }),
        })
      ).json();
      return {
        consultation_id: cons.id as string,
        phone,
        payment_id: (pmt && pmt.id) || null,
        payment_error: pmt && pmt.detail ? String(pmt.detail) : null,
      };
    },
    { branchId, tag, paid, PRODUCT_ID, PACKAGE_ID },
  );
}

/** Drives an account negative using only public endpoints: the permit expense is
 *  filed at exactly the collected balance (the create cap allows this), then the
 *  collection is cancelled. client_paid drops to 0 while `posted` stays, so the
 *  account sits at -`amount` with a filed, unpaid permit expense on it. */
async function makeOverdrawn(page: Page, client: { consultation_id: string; payment_id: string | null }, branchId: string, amount: number) {
  return page.evaluate(
    async ({ consultation_id, payment_id, branchId, amount }) => {
      const tok = (await (
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
        })
      ).json()).access_token;
      const h = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      };
      const exp = await (
        await fetch('/api/v1/finance/expenses', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            branch_id: branchId,
            category: 'Permit Payment',
            account: 'client_accounts',
            amount,
            consultation_id,
            description: 'e2e permit',
          }),
        })
      ).json();
      if (!exp.id) return { expense_id: null as string | null, error: String(exp.detail) };
      // Cancel the collection → client_paid 0, posted stays, account overdrawn.
      const cancel = await fetch(`/api/v1/payments/${payment_id}/cancel`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ reason: 'e2e fixture' }),
      });
      return {
        expense_id: exp.id as string,
        error: cancel.ok ? null : `cancel ${cancel.status}`,
      };
    },
    { consultation_id: client.consultation_id, payment_id: client.payment_id, branchId, amount },
  );
}

async function cleanup(page: Page, consultationIds: string[]) {
  await page.evaluate(async (ids) => {
    const tok = (await (
      await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
      })
    ).json()).access_token;
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
    // Fundings have RESTRICT on consultations, so drop them first.
    const f = await (await fetch('/api/v1/finance/client-accounts/fundings', { headers: h })).json();
    for (const item of f.items || []) {
      if (ids.includes(item.from_consultation_id) || ids.includes(item.to_consultation_id)) {
        await fetch(`/api/v1/finance/client-accounts/fundings/${item.id}/cancel`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ reason: 'e2e cleanup' }),
        });
      }
    }
    for (const id of ids) {
      const list = await (
        await fetch(`/api/v1/finance/expenses?consultation_id=${id}&page_size=100`, { headers: h })
      ).json();
      for (const e of list.items || []) {
        if (e.status !== 'paid') await fetch(`/api/v1/finance/expenses/${e.id}`, { method: 'DELETE', headers: h });
      }
    }
    await fetch('/api/v1/consultations/bulk-delete', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ ids }),
    });
  }, consultationIds);
}

test.describe('Client Accounts', () => {
  let donorPhone: string;
  let recvPhone: string;
  let fixtureTag: string;
  let donorId: string;
  let recvId: string;

  test.beforeEach(async ({ page }) => {
    // Fixtures are created via the API, which needs a page origin for relative URLs.
    await page.goto('/login');
    const tag = Date.now().toString().slice(-7);
    fixtureTag = tag;
    donorPhone = `2569${tag}1`;
    recvPhone = `2569${tag}2`;
    // Donor holds 1,000,000 it can give. Recipient collects 320,000, files a
    // permit expense for exactly that, then the collection is cancelled →
    // recipient sits at -320,000 with 320,000 of unpaid permit expense.
    const donor = await makeClient(page, BRANCH, `${tag}1`, 1000000);
    const recv = await makeClient(page, BRANCH, `${tag}2`, 320000);
    expect(donor.payment_error, 'donor fixture collection').toBeNull();
    expect(recv.payment_error, 'recipient fixture collection').toBeNull();
    const over = await makeOverdrawn(page, recv, BRANCH, 320000);
    expect(over.error, 'recipient fixture overdraft').toBeNull();
    donorId = donor.consultation_id;
    recvId = recv.consultation_id;
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page, [donorId, recvId].filter(Boolean));
  });

  test('shows the drawn balance and the permit shortfall, and funds it from another client', async ({
    page,
  }) => {
    await loginSuperAdmin(page);

    await page.getByLabel('Toggle menu').click();
    await page.getByText('Finance', { exact: true }).click();
    await page.getByText('Client Accounts', { exact: true }).click();
    await expect(page).toHaveURL(/\/client-accounts/);
    await expect(page.getByTestId('accounts-table')).toBeVisible();

    // Total drawn column and the recipient's figures.
    await expect(page.getByTestId(`drawn-${recvPhone}`)).toHaveText(/320,?000/);
    await expect(page.getByTestId(`permit-unpaid-${recvPhone}`)).toHaveText(/320,?000/);
    // Needed = permit unpaid - balance (0 paid - 320,000 drawn = -320,000)
    await expect(page.getByTestId(`needed-${recvPhone}`)).toHaveText(/640,?000/);
    await expect(page.getByTestId(`balance-${recvPhone}`)).toHaveText(/-320,?000/);

    // Select the recipient and open the funding dialog.
    await page.getByTestId(`select-${recvPhone}`).check();
    await page.getByTestId('fund-selected').click();
    const dialog = page.getByRole('dialog', { name: 'Fund Client Accounts' });
    await expect(dialog).toBeVisible();

    // Pick the donor.
    await page.getByTestId('fund-donor').click();
    await page.locator('.p-select-option', { hasText: 'Acc' }).first().click();
    await expect(dialog.getByText(/Available to give/)).toBeVisible();

    // The shortfall is pre-filled as the amount (testid sits on the p-inputnumber
    // host, so read the inner input).
    await expect(page.locator(`[data-testid="alloc-amount-${recvPhone}"] input`)).toHaveValue(/640,?000/);
    await page.getByTestId('fund-reason').fill('Cover unpaid permit expenses');
    await page.getByTestId('confirm-fund').click();

    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByText('Client accounts funded')).toBeVisible();

    // Recipient is no longer overdrawn; donor is drawn down.
    await page.reload();
    await expect(page.getByTestId(`balance-${recvPhone}`)).toHaveText(/320,?000/);
    await expect(page.getByTestId(`needed-${recvPhone}`)).toHaveText('—');
    await expect(page.getByTestId(`balance-${donorPhone}`)).toHaveText(/360,?000/);

    // An audit row exists for this run. The history table shows client names, so
    // filter on the per-run fixture tag rather than the reason text (a retried run
    // re-uses the reason and would otherwise match stale rows).
    const historyRow = page
      .locator('[data-testid="fundings-table"] tbody tr')
      .filter({ hasText: `Acc${fixtureTag}` });
    await expect(historyRow).toHaveCount(1);
    await expect(historyRow).toContainText('Cover unpaid permit expenses');
    await historyRow.getByRole('button').click();
    await page.getByRole('button', { name: 'Cancel funding' }).click();
    await expect(page.getByText('Funding cancelled')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId(`balance-${recvPhone}`)).toHaveText(/-320,?000/);
  });

  test('rejects a funding that overdraws the funding client, crosses branches, or self-funds', async ({
    page,
  }) => {
    const results = await page.evaluate(
      async ({ donorId, recvId }) => {
        const tok = (await (
          await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
          })
        ).json()).access_token;
        const post = (body: any) =>
          fetch('/api/v1/finance/client-accounts/fund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify(body),
          });

        // The recipient's shortfall is 640,000 and the donor holds 1,000,000, so
        // an over-request is trimmed to the shortfall instead of rejected. Draw
        // 700,000 of the donor's own account down first so the shortfall really
        // does exceed what the donor can give, which must still be refused.
        const drawn = await fetch('/api/v1/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({
            branch_id: '00000000-0000-0000-0000-000000000002',
            category: 'Police Booking',
            account: 'client_accounts',
            amount: 700000,
            consultation_id: donorId,
            description: 'overdraw probe',
          }),
        });
        const overdraw = await post({
          from_consultation_id: donorId,
          to_consultation_id: recvId,
          amount: 9999999,
        });
        const self = await post({
          from_consultation_id: recvId,
          to_consultation_id: recvId,
          amount: 1000,
        });
        const otherBranch = await post({
          from_consultation_id: '72e3360f-f211-4150-82a8-fc625a83b94c',
          to_consultation_id: recvId,
          amount: 1000,
        });
        const zero = await post({
          from_consultation_id: donorId,
          to_consultation_id: recvId,
          amount: 0,
        });
        return {
          drawn: drawn.status,
          overdraw: [overdraw.status, (await overdraw.json()).detail],
          self: [self.status, (await self.json()).detail],
          otherBranch: [otherBranch.status, (await otherBranch.json()).detail],
          zero: [zero.status, (await zero.json()).detail],
        };
      },
      { donorId, recvId },
    );
    expect(results.drawn).toBe(201);
    expect(results.overdraw[0]).toBe(400);
    expect(results.overdraw[1]).toMatch(/exceeds the funding client/);
    expect(results.self[0]).toBe(400);
    expect(results.otherBranch[0]).toBe(400);
    expect(results.otherBranch[1]).toMatch(/same branch/);
    expect(results.zero[0]).toBe(400);
  });

  test('a funded client can post the permit expense it was short on', async ({ page }) => {
    await loginSuperAdmin(page);
    const out = await page.evaluate(
      async ({ donorId, recvId, branchId }) => {
        const tok = (await (
          await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
          })
        ).json()).access_token;
        const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
        const fund = await (
          await fetch('/api/v1/finance/client-accounts/fund', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
              from_consultation_id: donorId,
              to_consultation_id: recvId,
              amount: 640000,
              reason: 'e2e',
            }),
          })
        ).json();
        // Recipient sat at -320000, so after funding it holds exactly 320000.
        const ok = await fetch('/api/v1/finance/expenses', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            branch_id: branchId,
            category: 'Permit Payment',
            account: 'client_accounts',
            amount: 320000,
            consultation_id: recvId,
            description: 'post-fund probe',
          }),
        });
        const tooMuch = await fetch('/api/v1/finance/expenses', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            branch_id: branchId,
            category: 'Permit Payment',
            account: 'client_accounts',
            amount: 1,
            consultation_id: recvId,
            description: 'post-fund probe 2',
          }),
        });
        const bal = await (
          await fetch(`/api/v1/finance/expenses/client-account-balance?consultation_id=${recvId}`, {
            headers: { Authorization: `Bearer ${tok}` },
          })
        ).json();
        return {
          fundingId: fund.id,
          ok: ok.status,
          tooMuch: [tooMuch.status, (await tooMuch.json()).detail],
          remaining: bal.remaining,
        };
      },
      { donorId, recvId, branchId: BRANCH },
    );
    expect(out.ok).toBe(201);
    expect(out.tooMuch[0]).toBe(400);
    expect(out.tooMuch[1]).toMatch(/exceeds this client's remaining/);
    expect(out.remaining).toBe(0);
  });

  test('caps a funding at the shortfall and applies a multi-client funding atomically', async ({
    page,
  }) => {
    await loginSuperAdmin(page);
    const out = await page.evaluate(
      async ({ donorId, recvId, branchId }) => {
        const tok = (await (
          await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '0782832711', pin: '1234' }),
          })
        ).json()).access_token;
        const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
        const post = (body: any) =>
          fetch('/api/v1/finance/client-accounts/fund', {
            method: 'POST',
            headers: h,
            body: JSON.stringify(body),
          });

        // The donor has 1,000,000 available, the recipient needs 640,000, so a
        // 900,000 request must be trimmed to the shortfall rather than rejected
        // and rather than overfunding the account.
        const over = await (
          await post({
            from_consultation_id: donorId,
            allocations: [{ to_consultation_id: recvId, amount: 900000 }],
          })
        ).json();
        // Second request: the shortfall is already covered, so nothing is left.
        const again = await (
          await post({
            from_consultation_id: donorId,
            allocations: [{ to_consultation_id: recvId, amount: 900000 }],
          })
        ).json();

        // Atomicity: a batch whose last leg is invalid must leave nothing behind.
        const before = await (
          await fetch('/api/v1/finance/client-accounts/fundings', { headers: h })
        ).json();
        const badBatch = await post({
          from_consultation_id: donorId,
          allocations: [
            { to_consultation_id: '72e3360f-f211-4150-82a8-fc625a83b94c', amount: 5000 },
          ],
        });

        const bal = await (
          await fetch(`/api/v1/finance/expenses/client-account-balance?consultation_id=${recvId}`, {
            headers: h,
          })
        ).json();
        const after = await (
          await fetch('/api/v1/finance/client-accounts/fundings', { headers: h })
        ).json();
        return {
          overAmount: over.amount,
          overFundings: (over.fundings || []).length,
          overNeeded: bal.funding_needed,
          againDetail: again.detail,
          badBatch: [badBatch.status, (await badBatch.json()).detail],
          beforeCount: before.total,
          afterCount: after.total,
        };
      },
      { donorId, recvId, branchId: BRANCH },
    );
    // Trimmed to the shortfall, one funding row, nothing left to cover.
    expect(out.overAmount).toBe(640000);
    expect(out.overFundings).toBe(1);
    expect(out.overNeeded).toBe(0);
    expect(out.againDetail).toMatch(/shortfall left to cover/);
    // A cross-branch leg fails the whole batch: no new funding row.
    expect(out.badBatch[0]).toBe(400);
    expect(out.badBatch[1]).toMatch(/same branch/);
    expect(out.afterCount).toBe(out.beforeCount);
  });
});
