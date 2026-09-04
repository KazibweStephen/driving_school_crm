import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { ExpenseService, Expense, ExpenseCreatePayload, UnremittedClientPayment, ExpenseCategory } from '../../core/services/expense.service';
import { PaymentService, BranchInfo } from '../../core/services/payment.service';
import { CatalogService, Vehicle } from '../../core/services/catalog.service';
import { ConsultationService } from '../../core/services/consultation.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney, toISODate, todayISO } from '../../shared/format';

type Step = 'list' | 'create';
type StatusFilter = '' | 'pending' | 'approved' | 'rejected' | 'paid';
type ExpenseTab = 'expenses' | 'sms';

const SMS_CATEGORY = 'SMS';

@Component({
  selector: 'app-expenses',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
    DialogModule,
    LoadingOverlay,
    PageHeader,
  ],
  templateUrl: './expenses.html',
})
export class Expenses {
  private auth = inject(AuthService);
  private expenseService = inject(ExpenseService);
  private paymentService = inject(PaymentService);
  private catalog = inject(CatalogService);
  private consultationService = inject(ConsultationService);
  private messageService = inject(MessageService);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;
  permissions = this.auth.permissions;

  step = signal<Step>('list');
  loading = signal(false);
  submitting = signal(false);

  expenses = signal<Expense[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = 20;

  statusFilter = signal<StatusFilter>('');
  branches = signal<BranchInfo[]>([]);
  branchId = signal<string | null>(null);
  tab = signal<ExpenseTab>('expenses');
  tabOptions: { label: string; value: ExpenseTab }[] = [
    { label: 'Expenses', value: 'expenses' },
    { label: 'SMS', value: 'sms' },
  ];

  // create form
  amount = signal<number | null>(null);
  charges = signal<number>(0);
  description = signal('');
  category = signal<string>('');
  expenseDate = signal<string>(todayISO());
  expenseDateObject = computed(() =>
    this.expenseDate() ? new Date(this.expenseDate() + 'T00:00:00') : null,
  );
  receiptUrl = signal<string | null>(null);
  selectedFile: File | null = null;

  // pay dialog state
  showPayDialog = signal(false);
  payingExpense = signal<Expense | null>(null);
  payCharges = signal(0);
  payReceiptUrl = signal<string | null>(null);
  paySelectedFile: File | null = null;

  vehicles = signal<Vehicle[]>([]);
  vehicleId = signal<string | null>(null);
  mileage = signal<number | null>(null);
  vehicleOptions = computed(() =>
    this.vehicles().map((v) => ({
      label: `${v.plate_number} · ${v.transmission}`,
      value: v.id,
    })),
  );

  categoriesMeta = new Map<string, string>();
  clientAccountAvailable = signal(0);
  clientAccountLoading = signal(false);
  clientAccountPayments = signal<UnremittedClientPayment[]>([]);
  clientAccountPaymentsFiltered = signal<UnremittedClientPayment[]>([]);
  clientAccountSearch = signal('');
  accountCategories = new Set<string>();

  // client-linked expense support (categories with requires_client)
  requiresClientCategories = new Set<string>();
  consultationId = signal<string | null>(null);
  selectedClientLabel = signal('');
  selectedClientAvailable = signal<number | null>(null);

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Paid', value: 'paid' },
  ];
  categories = signal<ExpenseCategory[]>([]);
  categoryOptions = computed(() => {
    const opts = this.categories().map((c) => ({ label: c.name, value: c.name }));
    return [...opts, { label: 'Other', value: 'Other' }];
  });

  constructor() {
    this.loadExpenses();
    this.loadBranches();
    this.loadCategoryAccounts();
  }

  private loadCategoryAccounts() {
    this.expenseService.listExpenseCategories().subscribe({
      next: (res) => {
        const meta = new Map<string, string>();
        const clientAcc = new Set<string>();
        const clientReq = new Set<string>();
        for (const c of res.items ?? []) {
          meta.set(c.name, c.account || 'petty_cash');
          if ((c.account || 'petty_cash') === 'client_accounts') clientAcc.add(c.name);
          if (c.requires_client) clientReq.add(c.name);
        }
        this.categoriesMeta = meta;
        this.accountCategories = clientAcc;
        this.requiresClientCategories = clientReq;
        this.categories.set((res.items ?? []).filter((c) => c.is_active));
      },
      error: () => {},
    });
  }

  categoryRequiresClient(): boolean {
    return this.requiresClientCategories.has(this.category());
  }

  selectClientAccount(p: UnremittedClientPayment) {
    this.consultationId.set(p.consultation_id);
    this.selectedClientLabel.set(`${p.client_name || p.client_phone} · ${p.client_phone}`);
    this.selectedClientAvailable.set(p.amount ?? 0);
    this.clientAccountSearch.set('');
    this.applyClientAccountPaymentFilter();
  }

  clearClient() {
    this.consultationId.set(null);
    this.selectedClientLabel.set('');
    this.selectedClientAvailable.set(null);
    this.clientAccountSearch.set('');
    this.applyClientAccountPaymentFilter();
  }

  clientFundsOk(): boolean {
    const avail = this.selectedClientAvailable();
    if (avail == null) return true;
    if (!(this.amount() ?? 0)) return true;
    return (this.amount() ?? 0) <= avail + 0.001;
  }

  isClientAccountCategory(): boolean {
    return this.accountCategories.has(this.category());
  }

  needsClient(): boolean {
    return this.requiresClientCategories.has(this.category()) || this.isClientAccountCategory();
  }

  async loadClientAccountDetail() {
    const branchId = this.branchId();
    if (this.needsClient() && branchId) {
      this.clientAccountLoading.set(true);
      this.clientAccountPayments.set([]);
      this.clientAccountPaymentsFiltered.set([]);
      this.expenseService.getClientAccountAvailable(branchId).subscribe({
        next: (v) => this.clientAccountAvailable.set(v),
        error: () => this.clientAccountAvailable.set(0),
      });
      this.expenseService.getUnremittedClientPayments(branchId).subscribe({
        next: (p) => {
          this.clientAccountPayments.set(p);
          this.applyClientAccountPaymentFilter();
          this.clientAccountLoading.set(false);
        },
        error: () => {
          this.clientAccountPayments.set([]);
          this.clientAccountPaymentsFiltered.set([]);
          this.clientAccountLoading.set(false);
        },
      });
      return;
    }
    this.clientAccountAvailable.set(0);
    this.clientAccountPayments.set([]);
    this.clientAccountPaymentsFiltered.set([]);
  }

  applyClientAccountPaymentFilter() {
    const q = (this.clientAccountSearch() || '').trim().toLowerCase();
    const all = this.clientAccountPayments();
    if (!q) {
      this.clientAccountPaymentsFiltered.set(all);
      return;
    }
    this.clientAccountPaymentsFiltered.set(all.filter((p) =>
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.client_phone || '').toLowerCase().includes(q),
    ));
  }

  onClientAccountSearch(value: string) {
    this.clientAccountSearch.set(value);
    this.applyClientAccountPaymentFilter();
  }

  parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    return new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  }

  loadExpenses() {
    this.loading.set(true);
    const isSms = this.tab() === 'sms';
    this.expenseService
      .getExpenses({
        branch_id: this.branchId(),
        status: isSms ? 'paid' : (this.statusFilter() || null),
        category: isSms ? SMS_CATEGORY : null,
        category_not: isSms ? null : SMS_CATEGORY,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.expenses.set(res.items ?? []);
          this.total.set(res.total ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({ severity: 'error', summary: 'Could not load expenses' });
        },
      });
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        this.catalog.getCurrentUser().subscribe({
          next: (me) => {
            const assigned = (me.branch_ids ?? []).map(String);
            const match = assigned.find((id) => branches.some((b) => b.id === id));
            if (match) this.branchId.set(match);
            else if (branches.length === 1 && !this.branchId()) {
              this.branchId.set(branches[0].id);
            }
          },
          error: () => {
            if (branches.length === 1 && !this.branchId()) {
              this.branchId.set(branches[0].id);
            }
          },
        });
      },
      error: () => {},
    });
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter.set(value);
    this.page.set(1);
    this.loadExpenses();
  }

  setTab(value: ExpenseTab) {
    if (this.tab() === value) return;
    this.tab.set(value);
    this.page.set(1);
    this.loadExpenses();
  }

  setBranchId(value: string | null) {
    this.branchId.set(value);
    this.page.set(1);
    this.loadExpenses();
  }

  onExpenseDate(date: Date | null) {
    if (date) this.expenseDate.set(toISODate(date));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFile = file;
  }

  openCreate() {
    this.amount.set(null);
    this.charges.set(0);
    this.description.set('');
    this.category.set('');
    this.expenseDate.set(todayISO());
    this.receiptUrl.set(null);
    this.selectedFile = null;
    this.vehicleId.set(null);
    this.mileage.set(null);
    this.vehicles.set([]);
    if (this.branches().length > 0 && !this.branchId()) {
      this.branchId.set(this.branches()[0].id);
    }
    this.clientAccountAvailable.set(0);
    this.clientAccountPayments.set([]);
    this.clientAccountPaymentsFiltered.set([]);
    this.clientAccountSearch.set('');
    this.clearClient();
    this.loadVehiclesForBranch();
    this.loadClientAccountDetail();
    this.step.set('create');
  }

  onCreateBranchChange(value: string | null) {
    this.branchId.set(value);
    this.loadVehiclesForBranch();
    this.loadClientAccountDetail();
  }

  onCategoryChange(value: string) {
    this.category.set(value);
    this.clearClient();
    this.loadClientAccountDetail();
  }

  private loadVehiclesForBranch() {
    const branchId = this.branchId();
    if (!branchId) return;
    this.vehicles.set([]);
    this.vehicleId.set(null);
    this.catalog.listVehicles().subscribe({
      next: (vehicles) => {
        this.vehicles.set(
          vehicles.filter((v) => v.status === 'available' && v.branch_ids?.includes(branchId)),
        );
      },
      error: () => {},
    });
  }

  backToList() {
    this.step.set('list');
  }

  private uploadThenCreate(payload: ExpenseCreatePayload) {
    if (this.selectedFile) {
      this.expenseService.uploadReceipt(this.selectedFile).subscribe({
        next: (res) => this.doCreate({ ...payload, receipt_url: res.url }),
        error: () => {
          this.submitting.set(false);
          this.messageService.add({ severity: 'error', summary: 'Receipt upload failed' });
        },
      });
      return;
    }
    this.doCreate(payload);
  }

  private doCreate(payload: ExpenseCreatePayload) {
    this.expenseService.createExpense(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.messageService.add({ severity: 'success', summary: 'Expense submitted' });
        this.step.set('list');
        this.loadExpenses();
      },
      error: (err) => {
        this.submitting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not submit expense',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  submitExpense() {
    const amount = this.amount();
    const branchId = this.branchId();
    if (!branchId) {
      this.messageService.add({ severity: 'warn', summary: 'Select a branch' });
      return;
    }
    if (amount == null || amount <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Enter a valid amount' });
      return;
    }
    if (this.needsClient() && !this.consultationId()) {
      this.messageService.add({ severity: 'warn', summary: 'Select a client for this expense' });
      return;
    }
    if (this.needsClient() && !this.clientFundsOk()) {
      this.messageService.add({
        severity: 'error',
        summary: 'Insufficient client funds',
        detail: `Selected client has only ${this.money(this.selectedClientAvailable() ?? 0)} available.`,
      });
      return;
    }
    if (this.category() === 'Fuel' && !this.vehicleId()) {
      this.messageService.add({ severity: 'warn', summary: 'Select the vehicle being fueled' });
      return;
    }
    this.submitting.set(true);
    const isFuel = this.category() === 'Fuel';
    const payload: ExpenseCreatePayload = {
      branch_id: branchId,
      amount,
      charges: this.charges() || 0,
      description: this.description() || undefined,
      category: this.category() || undefined,
      vehicle_id: isFuel ? (this.vehicleId() ?? undefined) : undefined,
      mileage: isFuel ? (this.mileage() ?? undefined) : undefined,
      consultation_id: this.consultationId() ?? undefined,
      expense_date: this.expenseDate(),
      status: 'pending',
    };
    this.uploadThenCreate(payload);
  }

  approve(expense: Expense) {
    this.runAction(
      expense.id,
      () => this.expenseService.approveExpense(expense.id),
      'Expense approved',
    );
  }

  reject(expense: Expense) {
    const reason = window.prompt('Rejection reason');
    if (!reason) return;
    this.runAction(
      expense.id,
      () => this.expenseService.rejectExpense(expense.id, reason),
      'Expense rejected',
    );
  }

  openPay(expense: Expense) {
    this.payingExpense.set(expense);
    this.payCharges.set(expense.charges ?? 0);
    this.payReceiptUrl.set(null);
    this.paySelectedFile = null;
    this.showPayDialog.set(true);
  }

  onPayFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.paySelectedFile = file;
    input.value = '';
  }

  submitPayment() {
    const expense = this.payingExpense();
    if (!expense) return;
    this.loading.set(true);
    if (this.paySelectedFile) {
      this.expenseService.uploadReceipt(this.paySelectedFile).subscribe({
        next: (res) => this.doPay(expense, this.payCharges() || 0, res.url),
        error: () => {
          this.loading.set(false);
          this.messageService.add({ severity: 'error', summary: 'Receipt upload failed' });
        },
      });
      return;
    }
    this.doPay(expense, this.payCharges() || 0, this.payReceiptUrl());
  }

  private doPay(expense: Expense, charges: number, receiptUrl: string | null) {
    this.expenseService.markPaid(expense.id, {
      charges,
      receipt_url: receiptUrl || undefined,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.showPayDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Expense marked paid' });
        this.loadExpenses();
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not mark paid',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  deleteExpense(expense: Expense) {
    if (!window.confirm('Delete this expense?')) return;
    this.expenseService.deleteExpense(expense.id).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Expense deleted' });
        this.loadExpenses();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Could not delete',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  private runAction<T>(id: string, action: () => import('rxjs').Observable<T>, successMsg: string) {
    this.loading.set(true);
    action().subscribe({
      next: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'success', summary: successMsg });
        this.loadExpenses();
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Action failed',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  canCreate() {
    return this.permissions().includes('expenses.create');
  }

  canApprove(expense: Expense) {
    return (
      expense.status === 'pending' &&
      this.permissions().includes('expenses.approve') &&
      expense.created_by_phone !== this.auth.currentUserPhone()
    );
  }

  canReject(expense: Expense) {
    return (
      expense.status === 'pending' &&
      this.permissions().includes('expenses.reject') &&
      expense.created_by_phone !== this.auth.currentUserPhone()
    );
  }

  canPay(expense: Expense) {
    return expense.status === 'approved' && this.permissions().includes('expenses.pay');
  }

  canDelete(expense: Expense) {
    return (
      (expense.status === 'pending' || expense.status === 'rejected') &&
      this.permissions().includes('expenses.delete')
    );
  }

  statusClass(status: string): string {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'approved':
        return 'bg-blue-100 text-blue-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-amber-100 text-amber-700';
    }
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }
}
