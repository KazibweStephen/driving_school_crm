import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FinanceService, OperatingEntry, OperatingSummary, OperatingClientAccount, OperatingOwedSummary, Branch } from '../../core/services/finance.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney, todayISO } from '../../shared/format';

interface PoolOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-operating-account',
  imports: [FormsModule, RouterLink, LoadingOverlay],
  templateUrl: './operating-account.html',
})
export class OperatingAccount implements OnInit {
  private finance = inject(FinanceService);
  private auth = inject(AuthService);

  currency = this.auth.currencyCode;
  loading = signal(true);
  summary = signal<OperatingSummary | null>(null);
  entries = signal<OperatingEntry[]>([]);
  branches: Branch[] = [];

  showRecord = false;
  showFund = false;
  showRepay = false;

  poolOptions: PoolOption[] = [
    { label: 'Petty Cash', value: 'petty_cash' },
    { label: 'Client Accounts', value: 'client_accounts' },
  ];
  recordTypes = [
    { label: 'Equity / Owner Injection', value: 'equity' },
    { label: 'Loan Received', value: 'loan' },
    { label: 'Profit Allocation', value: 'profit' },
    { label: 'Operating Expense', value: 'operating_expense' },
  ];

  record = { entry_type: 'equity', amount: null as number | null, description: '', reference: '', entry_date: todayISO() };
  fund = { to_branch_id: null as string | null, pool: 'petty_cash', amount: null as number | null, description: '' };
  repay = { loan_entry_id: null as string | null, amount: null as number | null, description: '' };

  accounts = signal<OperatingClientAccount[]>([]);
  owed = signal<OperatingOwedSummary | null>(null);
  showPost = false;
  showReconcile = false;
  postNotes = '';
  postEntries = signal<{ consultation_id: string; amount: number | null }[]>([]);
  reconcileEntries = signal<{ post_id: string; amount: number | null }[]>([]);

  get canRecord() {
    return this.auth.hasPermission('finance.capital');
  }

  get canFund() {
    return this.auth.hasPermission('finance.fund');
  }

  ngOnInit() {
    this.loadBranches();
    this.load();
  }

  async loadBranches() {
    try {
      const branches = (await this.finance.myBranches().toPromise()) || [];
      const companyId = this.auth.currentUserCompanyId();
      let headOfficeId: string | null = null;
      if (companyId) {
        try {
          headOfficeId = (await this.finance.getCompany(companyId).toPromise())?.head_office_branch_id || null;
        } catch {
          headOfficeId = null;
        }
      }
      this.branches = branches.filter((b) => b.id !== headOfficeId);
    } catch {
      this.branches = [];
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const [s, e] = await Promise.all([
        this.finance.getOperatingSummary().toPromise(),
        this.finance.listOperatingEntries().toPromise(),
      ]);
      this.summary.set(s || null);
      this.entries.set(e || []);
    } catch {
      this.summary.set(null);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  money(value: number) {
    return formatMoney(value, this.currency());
  }

  entryLabel(e: OperatingEntry): string {
    return (e.entry_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  poolLabel(e: OperatingEntry): string {
    if (!e.target_pool) return '-';
    return e.target_pool === 'petty_cash' ? 'Petty Cash' : 'Client Accounts';
  }

  loans(): OperatingEntry[] {
    return this.entries().filter((e) => e.entry_type === 'loan');
  }

  openRecord() {
    this.record = { entry_type: 'equity', amount: null, description: '', reference: '', entry_date: todayISO() };
    this.showRecord = true;
  }

  async saveRecord() {
    if (!this.record.amount || !this.record.description) return;
    try {
      await this.finance.createOperatingEntry({
        entry_type: this.record.entry_type,
        amount: this.record.amount,
        description: this.record.description,
        reference: this.record.reference || null,
        entry_date: this.record.entry_date || null,
      }).toPromise();
      this.showRecord = false;
      await this.load();
    } catch {
      // surface error via inline handling
    }
  }

  openFund() {
    this.fund = { to_branch_id: this.branches[0]?.id || null, pool: 'petty_cash', amount: null, description: '' };
    this.showFund = true;
  }

  async saveFund() {
    if (!this.fund.to_branch_id || !this.fund.amount) return;
    try {
      await this.finance.fundBranchFromOperating({
        to_branch_id: this.fund.to_branch_id,
        pool: this.fund.pool,
        amount: this.fund.amount,
        description: this.fund.description || null,
      }).toPromise();
      this.showFund = false;
      await this.load();
    } catch {
      // surface error via inline handling
    }
  }

  openRepay() {
    this.repay = { loan_entry_id: this.loans()[0]?.id || null, amount: null, description: '' };
    this.showRepay = true;
  }

  async saveRepay() {
    if (!this.repay.loan_entry_id || !this.repay.amount) return;
    try {
      await this.finance.repayOperatingLoan(this.repay.loan_entry_id, this.repay.amount, this.repay.description || null).toPromise();
      this.showRepay = false;
      await this.load();
    } catch {
      // surface error via inline handling
    }
  }

  async openPost() {
    try {
      const accounts = (await this.finance.listClientAccounts().toPromise()) || [];
      this.accounts.set(accounts);
    } catch {
      this.accounts.set([]);
    }
    this.postEntries.set(this.accounts().map((a) => ({ consultation_id: a.consultation_id, amount: null })));
    this.postNotes = '';
    this.showPost = true;
  }

  postSelected(): { consultation_id: string; amount: number }[] {
    return this.postEntries().filter((e) => e.amount && e.amount > 0) as { consultation_id: string; amount: number }[];
  }

  async savePost() {
    const items = this.postSelected();
    if (items.length === 0) return;
    try {
      await this.finance.postFromClients(items, this.postNotes || undefined).toPromise();
      this.showPost = false;
      await this.load();
    } catch {
      // surface error via inline handling
    }
  }

  async openReconcile() {
    try {
      const owed = (await this.finance.getOwedToClients().toPromise()) || null;
      this.owed.set(owed);
    } catch {
      this.owed.set(null);
    }
    this.reconcileEntries.set(
      (this.owed()?.accounts || []).flatMap((a) =>
        (a.posts || []).map((p) => ({ post_id: p.post_id, amount: p.owed_back || null }))
      )
    );
    this.showReconcile = true;
  }

  reconcileSelected(): { post_id: string; amount: number }[] {
    return this.reconcileEntries().filter((e) => e.amount && e.amount > 0) as { post_id: string; amount: number }[];
  }

  async saveReconcile() {
    const items = this.reconcileSelected();
    if (items.length === 0) return;
    try {
      await this.finance.reconcileBack(items).toPromise();
      this.showReconcile = false;
      await this.load();
    } catch {
      // surface error via inline handling
    }
  }
}
