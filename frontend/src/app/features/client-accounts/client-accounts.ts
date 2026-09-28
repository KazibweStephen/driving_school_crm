import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { CurrencyService } from '../../core/services/currency.service';
import {
  ClientAccount,
  ClientAccountFunding,
  ClientAccountsResponse,
  ClientAccountsService,
} from '../../core/services/client-accounts.service';

@Component({
  selector: 'app-client-accounts',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    ButtonModule, CardModule, DialogModule, InputTextModule, InputNumberModule,
    SelectModule, MultiSelectModule, TableModule, SkeletonModule, TagModule, ToastModule, ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './client-accounts.html',
})
export class ClientAccountsCmp implements OnInit {
  private svc = inject(ClientAccountsService);
  private companyService = inject(CompanyService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  public authService = inject(AuthService);
  public currencyService = inject(CurrencyService);

  accounts = signal<ClientAccount[]>([]);
  donors = signal<ClientAccount[]>([]);
  totals = signal<ClientAccountsResponse['totals'] | null>(null);
  fundings = signal<ClientAccountFunding[]>([]);
  loading = signal(false);

  search = signal('');
  onlyOverdrawn = signal(false);
  branchIds = signal<string[]>([]);
  branches = signal<Branch[]>([]);
  allBranches = signal<Branch[]>([]);

  selected = signal<Set<string>>(new Set<string>());
  showFundDialog = signal(false);
  fundingSaving = signal(false);
  fundError = signal('');
  fundReason = signal('');
  donorId = signal<string | null>(null);
  fundingAmounts = signal<Record<string, number>>({});

  branchOptions = computed(() => {
    const list = this.allBranches().length ? this.allBranches() : this.branches();
    return list.map((b) => ({ label: b.name, value: b.id }));
  });

  canFund = computed(
    () =>
      this.authService.hasPermission('client_accounts.fund') ||
      this.authService.hasPermission('client_accounts.manage'),
  );

  selectedAccounts = computed(() =>
    this.accounts().filter((a) => this.selected().has(a.consultation_id)),
  );

  /** Clients at each selected recipient's branch that can actually spare money.
   *  Loaded with its own unfiltered request so the "Overdrawn only" / search
   *  filters on the ledger can never hide the clients that are able to give. */
  donorOptions = computed(() => {
    const recipients = this.selectedAccounts();
    const ids = new Set(recipients.map((r) => r.consultation_id));
    const branchIds = new Set(recipients.map((r) => r.branch_id).filter(Boolean) as string[]);
    const pool = this.donors().length ? this.donors() : this.accounts();
    return pool
      .filter((a) => !ids.has(a.consultation_id))
      .filter((a) => a.branch_id && branchIds.has(a.branch_id))
      // A client can only give what is left after their own required expenses.
      .filter((a) => a.available_to_fund > 0.001)
      .sort((a, b) => b.available_to_fund - a.available_to_fund)
      .map((a) => ({
        label: `${a.client_name || a.client_phone} · ${a.branch_name} · can give ${this.fmt(a.available_to_fund)}`,
        value: a.consultation_id,
        remaining: a.remaining,
        available: a.available_to_fund,
        required: a.required,
      }));
  });

  donorAccount = computed(() => {
    const id = this.donorId();
    if (!id) return null;
    return (
      this.donors().find((a) => a.consultation_id === id) ??
      this.accounts().find((a) => a.consultation_id === id) ??
      null
    );
  });

  /** A single funding client can only cover recipients at its own branch, so a
   *  selection spanning branches has to be funded one branch at a time. */
  selectionSpansBranches = computed(() => {
    const set = new Set(
      this.selectedAccounts()
        .map((r) => r.branch_id)
        .filter(Boolean) as string[],
    );
    return set.size > 1;
  });

  /** What the funding client can actually give: their balance less the amount
   *  they still owe on their own expenses. Normally this is their profit. */
  donorAvailable = computed(() => {
    const donor = this.donorAccount();
    return donor ? donor.available_to_fund : 0;
  });

  /** Per-recipient allocations, with the whole shortfall pre-filled so the
   *  default action covers exactly the unpaid permit expenses. Amounts are
   *  trimmed against the funding client's available funds in row order. */
  allocations = computed(() => {
    const donor = this.donorAccount();
    const amounts = this.fundingAmounts();
    let donorLeft = donor ? donor.available_to_fund : Infinity;
    return this.selectedAccounts().map((a) => {
      const raw = amounts[a.consultation_id];
      const amount = raw === undefined || raw === null ? a.funding_needed : Number(raw);
      const capped = donor ? Math.min(Math.max(amount, 0), donorLeft) : Math.max(amount, 0);
      donorLeft -= capped;
      return {
        account: a,
        amount: Number(capped.toFixed(2)),
        needed: a.funding_needed,
        shortfall: Math.max(0, Number((a.funding_needed - capped).toFixed(2))),
      };
    });
  });

  /** Sum of what the selected clients need — the total the funding aims to cover. */
  totalNeeded = computed(() =>
    this.allocations().reduce((s, r) => s + r.needed, 0),
  );
  totalAllocated = computed(() =>
    this.allocations().reduce((s, r) => s + r.amount, 0),
  );
  /** Funds the funding client still has spare after this transfer. */
  donorRemaining = computed(() =>
    Number((this.donorAvailable() - this.totalAllocated()).toFixed(2)),
  );
  fundCanSubmit = computed(() => {
    const donor = this.donorAccount();
    if (!donor) return false;
    if (this.selectionSpansBranches()) return false;
    if (!this.allocations().length) return false;
    if (this.totalAllocated() <= 0) return false;
    return this.donorRemaining() >= -0.001;
  });

  ngOnInit() {
    this.loadBranches();
    this.load();
  }

  private async loadBranches() {
    try {
      this.branches.set((await this.companyService.myBranches().toPromise()) || []);
    } catch {
      this.branches.set([]);
    }
    const companyId = this.authService.currentUserCompanyId();
    if (companyId) {
      try {
        this.allBranches.set((await this.companyService.listBranches(companyId).toPromise()) || []);
      } catch {
        this.allBranches.set([]);
      }
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.svc
        .list({
          branch_ids: this.branchIds().length ? this.branchIds().join(',') : null,
          search: this.search().trim() || null,
          only_overdrawn: this.onlyOverdrawn(),
        })
        .toPromise();
      this.accounts.set(res?.items ?? []);
      this.totals.set(res?.totals ?? null);
      const f = await this.svc.fundings(this.branchIds()[0] ?? null).toPromise();
      this.fundings.set(f?.items ?? []);
      this.pruneSelection();
    } catch (e: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Could not load client accounts',
        detail: e?.error?.detail || 'Please try again.',
      });
    } finally {
      this.loading.set(false);
    }
  }

  private pruneSelection() {
    const present = new Set(this.accounts().map((a) => a.consultation_id));
    const next = new Set([...this.selected()].filter((id) => present.has(id)));
    if (next.size !== this.selected().size) this.selected.set(next);
  }

  applyFilters() {
    this.load();
  }

  clearFilters() {
    this.search.set('');
    this.onlyOverdrawn.set(false);
    this.branchIds.set([]);
    this.load();
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggleRow(a: ClientAccount) {
    const next = new Set(this.selected());
    if (next.has(a.consultation_id)) next.delete(a.consultation_id);
    else next.add(a.consultation_id);
    this.selected.set(next);
  }

  toggleAll() {
    const visible = this.accounts().map((a) => a.consultation_id);
    const allOn = visible.every((id) => this.selected().has(id));
    this.selected.set(allOn ? new Set<string>() : new Set(visible));
  }

  allVisibleSelected(): boolean {
    const visible = this.accounts().map((a) => a.consultation_id);
    return visible.length > 0 && visible.every((id) => this.selected().has(id));
  }

  openFundDialog() {
    this.fundError.set('');
    this.fundReason.set('');
    this.donorId.set(null);
    this.fundingAmounts.set({});
    this.showFundDialog.set(true);
    this.loadDonors();
  }

  /** Fetch the potential funding clients for the selected recipients' branches.
   *  Deliberately unfiltered so "Overdrawn only" and the search box on the
   *  ledger cannot empty the donor list. */
  private async loadDonors() {
    const branchIds = [
      ...new Set(
        this.selectedAccounts()
          .map((r) => r.branch_id)
          .filter(Boolean) as string[],
      ),
    ];
    if (!branchIds.length) {
      this.donors.set([]);
      return;
    }
    try {
      const res = await this.svc
        .list({ branch_ids: branchIds.join(','), only_overdrawn: false })
        .toPromise();
      this.donors.set(res?.items ?? []);
    } catch {
      this.donors.set([]);
    }
  }

  setDonor(id: string | null) {
    this.donorId.set(id);
    this.fundingAmounts.set({});
    this.fundError.set('');
  }

  setAmount(id: string, value: number | null) {
    const next = { ...this.fundingAmounts() };
    if (value === null || value === undefined || Number.isNaN(value)) delete next[id];
    else next[id] = Number(value);
    this.fundingAmounts.set(next);
  }

  resetToNeeded(id: string) {
    const next = { ...this.fundingAmounts() };
    delete next[id];
    this.fundingAmounts.set(next);
  }

  useFullDonorBalance() {
    const donor = this.donorAccount();
    if (!donor) return;
    const next: Record<string, number> = {};
    let left = donor.available_to_fund;
    for (const r of this.allocations()) {
      const take = Math.min(Math.max(r.needed, 0), left);
      if (take > 0) next[r.account.consultation_id] = Number(take.toFixed(2));
      left -= take;
      if (left <= 0.001) break;
    }
    this.fundingAmounts.set(next);
  }

  async submitFunding() {
    const donor = this.donorId();
    if (!donor) return;
    if (this.selectionSpansBranches()) {
      this.fundError.set(
        'A funding client can only cover clients at its own branch. Fund one branch at a time.',
      );
      return;
    }
    const rows = this.allocations().filter((r) => r.amount > 0);
    if (!rows.length) {
      this.fundError.set('Enter an amount for at least one client.');
      return;
    }
    if (this.donorRemaining() < -0.001) {
      this.fundError.set(
        'The total exceeds what the funding client can spare — their own unpaid expenses are kept back.',
      );
      return;
    }
    this.fundingSaving.set(true);
    this.fundError.set('');
    const reason = this.fundReason().trim();
    try {
      // One request: the backend applies every allocation or none of them.
      await this.svc
        .fund({
          from_consultation_id: donor,
          allocations: rows.map((r) => ({
            to_consultation_id: r.account.consultation_id,
            amount: r.amount,
          })),
          reason: reason || null,
        })
        .toPromise();
      this.messageService.add({
        severity: 'success',
        summary: 'Client accounts funded',
        detail: `${rows.length} client${rows.length > 1 ? 's' : ''} funded from ${
          this.donorAccount()?.client_name || 'the selected client'
        }.`,
      });
      this.showFundDialog.set(false);
      this.selected.set(new Set<string>());
      this.fundingAmounts.set({});
      this.donors.set([]);
      await this.load();
    } catch (e: any) {
      this.fundError.set(e?.error?.detail || 'Could not fund the client account.');
    } finally {
      this.fundingSaving.set(false);
    }
  }

  cancelFunding(f: ClientAccountFunding) {
    this.confirmationService.confirm({
      header: 'Cancel funding',
      message: `Take ${this.fmt(f.amount)} back from ${
        f.to_client_name || f.to_client_phone
      }? This is only possible while they have not drawn new expenses from their account since.`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { label: 'Cancel funding', severity: 'danger' },
      rejectButtonProps: { label: 'Keep it', severity: 'secondary', outlined: true },
      accept: async () => {
        try {
          await this.svc.cancelFunding(f.id).toPromise();
          this.messageService.add({
            severity: 'success',
            summary: 'Funding cancelled',
            detail: `${this.fmt(f.amount)} returned to ${
              f.from_client_name || f.from_client_phone
            }.`,
          });
          await this.load();
        } catch (e: any) {
          this.messageService.add({
            severity: 'error',
            summary: 'Could not cancel funding',
            detail: e?.error?.detail || 'Please try again.',
          });
        }
      },
    });
  }

  clientLink(id: string): string[] {
    return ['/consultations', id];
  }

  fmt(n: number | null | undefined): string {
    return Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  timeAgo(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}