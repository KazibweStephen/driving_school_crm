import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import {
  OperatingService,
  OperatingSummary,
  OperatingEntry,
  OperatingClientAccount,
  OperatingOwedSummary,
} from '../../core/services/operating.service';
import { CurrencyService } from '../../core/services/currency.service';

interface PoolOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-operating-account',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DialogModule, SelectModule,
    InputNumberModule, InputTextModule, TableModule, ToastModule, DatePickerModule,
  ],
  providers: [MessageService],
  templateUrl: './operating-account.html',
})
export class OperatingAccountCmp implements OnInit {
  summary = signal<OperatingSummary | null>(null);
  entries = signal<OperatingEntry[]>([]);
  loading = signal(false);
  loaded = false;

  showRecord = false;
  showFund = false;
  showRepay = false;

  branches: Branch[] = [];
  poolOptions: PoolOption[] = [
    { label: 'Petty Cash', value: 'petty_cash' },
    { label: 'Client Accounts', value: 'client_accounts' },
  ];

  record = { entry_type: 'equity', amount: null as number | null, description: '', reference: '', entryDate: null as Date | null };
  fund = { to_branch_id: null as string | null, pool: 'petty_cash', amount: null as number | null, description: '' };
  repay = { loan_entry_id: null as string | null, amount: null as number | null, description: '' };

  accounts = signal<OperatingClientAccount[]>([]);
  owed = signal<OperatingOwedSummary | null>(null);
  showPost = false;
  showOwed = false;
  postNotes = '';
  postEntries = signal<{ consultation_id: string; amount: number | null }[]>([]);
  reconcileEntries = signal<{ post_id: string; amount: number | null }[]>([]);

  constructor(
    private operatingService: OperatingService,
    private companyService: CompanyService,
    private auth: AuthService,
    private messageService: MessageService,
    public currencyService: CurrencyService,
  ) {}

  async ngOnInit() {
    try {
      const branches = (await this.companyService.myBranches().toPromise()) || [];
      const companyId = this.auth.currentUserCompanyId();
      let headOfficeId: string | null = null;
      if (companyId) {
        try {
          headOfficeId = (await this.companyService.get(companyId).toPromise())?.head_office_branch_id || null;
        } catch {
          headOfficeId = null;
        }
      }
      this.branches = branches.filter((b) => b.id !== headOfficeId);
    } catch {
      this.branches = [];
    }
    await this.load();
  }

  get canRecord(): boolean {
    return this.auth.hasPermission('finance.capital');
  }

  get canFund(): boolean {
    return this.auth.hasPermission('finance.fund');
  }

  async load() {
    this.loading.set(true);
    try {
      const [summary, entries] = await Promise.all([
        this.operatingService.getSummary().toPromise(),
        this.operatingService.listEntries().toPromise(),
      ]);
      this.summary.set(summary || null);
      this.entries.set(entries || []);
      this.loaded = true;
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load operating account' });
    } finally {
      this.loading.set(false);
    }
  }

  openRecord() {
    this.record = { entry_type: 'equity', amount: null, description: '', reference: '', entryDate: null };
    this.showRecord = true;
  }

  recordTypes() {
    return [
      { label: 'Equity / Owner Injection', value: 'equity' },
      { label: 'Loan Received', value: 'loan' },
      { label: 'Profit Allocation', value: 'profit' },
      { label: 'Operating Expense', value: 'operating_expense' },
    ];
  }

  entryLabel(e: OperatingEntry): string {
    return e.entry_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  poolLabel(e: OperatingEntry): string {
    if (!e.target_pool) return '-';
    return e.target_pool === 'petty_cash' ? 'Petty Cash' : 'Client Accounts';
  }

  async saveRecord() {
    if (!this.record.amount || !this.record.description) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Amount and description are required' });
      return;
    }
    try {
      await this.operatingService.createEntry({
        entry_type: this.record.entry_type,
        amount: this.record.amount,
        description: this.record.description,
        reference: this.record.reference || null,
        entry_date: this.record.entryDate ? this.record.entryDate.toISOString().slice(0, 10) : null,
      }).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Entry recorded' });
      this.showRecord = false;
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to record entry' });
    }
  }

  openFund() {
    this.fund = { to_branch_id: this.branches[0]?.id || null, pool: 'petty_cash', amount: null, description: '' };
    this.showFund = true;
  }

  async saveFund() {
    if (!this.fund.to_branch_id || !this.fund.amount) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Branch and amount are required' });
      return;
    }
    try {
      await this.operatingService.fundBranch({
        to_branch_id: this.fund.to_branch_id,
        pool: this.fund.pool,
        amount: this.fund.amount,
        description: this.fund.description || null,
      }).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Branch funded from operating account' });
      this.showFund = false;
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to fund branch' });
    }
  }

  loans(): any[] {
    return this.entries()
      .filter((e) => e.entry_type === 'loan')
      .map((e) => ({ ...e, repayLabel: `${e.reference || 'Loan'} — ${this.currencyService.symbol()} ${this.formatAmount(e.amount)}` }));
  }

  openRepay(loan?: OperatingEntry) {
    this.repay = { loan_entry_id: loan?.id || this.loans()[0]?.id || null, amount: null, description: '' };
    this.showRepay = true;
  }

  async saveRepay() {
    if (!this.repay.loan_entry_id || !this.repay.amount) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Loan and amount are required' });
      return;
    }
    try {
      await this.operatingService.repayLoan(this.repay.loan_entry_id, this.repay.amount, this.repay.description || null).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Loan repayment recorded' });
      this.showRepay = false;
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to record loan repayment' });
    }
  }

  formatAmount(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  async openPost() {
    try {
      this.accounts.set((await this.operatingService.listClientAccounts().toPromise()) || []);
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
    if (items.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Enter an amount for at least one account' });
      return;
    }
    try {
      await this.operatingService.postFromClients(items, this.postNotes || undefined).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posted from client accounts' });
      this.showPost = false;
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to post from client accounts' });
    }
  }

  async openOwed() {
    try {
      this.owed.set((await this.operatingService.getOwedToClients().toPromise()) || null);
    } catch {
      this.owed.set(null);
    }
    this.reconcileEntries.set(
      (this.owed()?.accounts || []).flatMap((a) => (a.posts || []).map((p) => ({ post_id: p.post_id, amount: p.owed_back || null })))
    );
    this.showOwed = true;
  }

  reconcileSelected(): { post_id: string; amount: number }[] {
    return this.reconcileEntries().filter((e) => e.amount && e.amount > 0) as { post_id: string; amount: number }[];
  }

  async saveReconcile() {
    const items = this.reconcileSelected();
    if (items.length === 0) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Enter an amount to return' });
      return;
    }
    try {
      await this.operatingService.reconcileBack(items).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Reconciled back to client accounts' });
      this.showOwed = false;
      await this.load();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to reconcile' });
    }
  }

  accountLabel(postId: string): string {
    const acc = this.owed()?.accounts.find((a) => (a.posts || []).some((p) => p.post_id === postId));
    return acc ? 'Client account (post)' : 'Client account';
  }

  postOwed(postId: string): number {
    for (const a of this.owed()?.accounts || []) {
      const p = (a.posts || []).find((pp) => pp.post_id === postId);
      if (p) return Number(p.owed_back) || 0;
    }
    return 0;
  }
}
