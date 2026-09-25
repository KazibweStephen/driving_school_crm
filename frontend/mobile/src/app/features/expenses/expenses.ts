import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { ExpenseService, Expense, ExpenseCreatePayload, ExpenseUpdatePayload, UnremittedClientPayment, ExpenseCategory } from '../../core/services/expense.service';
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;
  permissions = this.auth.permissions;

  // Permit-stage navigation context (query params: consultation_id, cart_item_id, category, back)
  routeConsultationId = signal('');
  routeCartItem = signal('');
  routeCategory = '';
  backUrl = '';
  contextClientLabel = signal('');
  contextPrefilled = signal(false);
  contextReadyConsultation = false;
  contextReadyCategories = false;
  contextClientBranch = signal<string | null>(null);

  step = signal<Step>('list');
  loading = signal(false);
  submitting = signal(false);

  expenses = signal<Expense[]>([]);
  statusTotals = signal<Record<string, { total: number; count: number }>>({});
  total = signal(0);
  page = signal(1);
  pageSize = 20;

  statusFilter = signal<StatusFilter>('');
  categoryFilter = signal<string>('');
  dateFromFilter = signal<string>('');
  dateToFilter = signal<string>('');
  dateFromFilterObject = computed(() =>
    this.dateFromFilter() ? new Date(this.dateFromFilter() + 'T00:00:00') : null,
  );
  dateToFilterObject = computed(() =>
    this.dateToFilter() ? new Date(this.dateToFilter() + 'T00:00:00') : null,
  );
  categoryFilterOptions = computed(() =>
    this.categories().map((c) => ({ label: c.name, value: c.name })),
  );
  hasActiveFilters = computed(() =>
    !!this.statusFilter() || !!this.categoryFilter() || !!this.dateFromFilter() || !!this.dateToFilter(),
  );
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
  payDate = signal<string | null>(null);
  payDateObject = computed(() =>
    this.payDate() ? new Date(this.payDate() + 'T00:00:00') : null,
  );

  // approve dialog state
  showApproveDialog = signal(false);
  approvingExpense = signal<Expense | null>(null);
  approveDate = signal<string | null>(null);
  approveDateObject = computed(() =>
    this.approveDate() ? new Date(this.approveDate() + 'T00:00:00') : null,
  );
  approving = signal(false);

  // edit dates dialog state (approval + payment dates)
  showDatesDialog = signal(false);
  datesExpense = signal<Expense | null>(null);
  editExpenseDate = signal<string | null>(null);
  editApprovalDate = signal<string | null>(null);
  editPaymentDate = signal<string | null>(null);
  editExpenseDateObject = computed(() =>
    this.editExpenseDate() ? new Date(this.editExpenseDate() + 'T00:00:00') : null,
  );
  editApprovalDateObject = computed(() =>
    this.editApprovalDate() ? new Date(this.editApprovalDate() + 'T00:00:00') : null,
  );
  editPaymentDateObject = computed(() =>
    this.editPaymentDate() ? new Date(this.editPaymentDate() + 'T00:00:00') : null,
  );
  savingDates = signal(false);

  // edit dialog state — edits missing category + client AND (with rights) full fuel details
  showEditDialog = signal(false);
  editingExpense = signal<Expense | null>(null);
  editHadCategory = false;
  editHadClient = false;
  editCategory = signal('');
  editOtherDetail = signal('');
  editClientLabel = signal('');
  editClientQuery = signal('');
  editClientResults = signal<any[]>([]);
  editClientSearching = signal(false);
  editVehicleId = signal<string | null>(null);
  editInstructorId = signal<string | null>(null);
  editMileage = signal<number | null>(null);
  editAmount = signal(0);
  editCharges = signal(0);
  editDescription = signal('');

  editCategoryOptions = computed(() => {
    const opts = this.categories().map((c) => ({ label: c.name, value: c.name }));
    return [...opts, { label: 'Other', value: 'Other' }];
  });

  editCanSave(): boolean {
    const e = this.editingExpense();
    if (!e) return false;
    const needsCategory = !this.editHadCategory;
    const needsClient = !this.editHadClient;
    if (needsCategory && !this.editCategory()) return false;
    if (needsCategory && this.editCategory() === 'Other' && !this.editOtherDetail().trim()) return false;
    if (needsCategory || needsClient) return true;
    return this.editFieldsChanged();
  }

  editFieldsChanged(): boolean {
    const e = this.editingExpense();
    if (!e) return false;
    if (this.editAmount() !== (e.amount ?? 0)) return true;
    if (this.editCharges() !== (e.charges ?? 0)) return true;
    if ((this.editDescription() || '') !== (e.description || '')) return true;
    if ((this.editVehicleId() || '') !== (e.vehicle_id || '')) return true;
    if ((this.editInstructorId() || '') !== (e.instructor_id || '')) return true;
    if (this.editMileage() !== (e.mileage ?? null)) return true;
    return false;
  }

  vehicles = signal<Vehicle[]>([]);
  vehicleId = signal<string | null>(null);
  mileage = signal<number | null>(null);
  vehicleOptions = computed(() =>
    this.vehicles().map((v) => ({
      label: `${v.plate_number} · ${v.transmission}`,
      value: v.id,
    })),
  );

  instructors = signal<{ label: string; value: string }[]>([]);
  instructorId = signal<string | null>(null);

  // details dialog state
  showDetailsDialog = signal(false);
  detailsExpense = signal<Expense | null>(null);

  categoriesMeta = new Map<string, string>();
  clientAccountAvailable = signal(0);
  clientAccountLoading = signal(false);
  clientAccountPayments = signal<UnremittedClientPayment[]>([]);
  clientAccountPaymentsFiltered = signal<UnremittedClientPayment[]>([]);
  clientAccountSearch = signal('');
  accountCategories = new Set<string>();

  // client-linked expense support (categories with requires_client)
  requiresClientCategories = new Set<string>();
  requiresUserCategories = new Set<string>();
  requiresVehicleCategories = new Set<string>();

  categoryRequiresUser(): boolean {
    return this.requiresUserCategories.has(this.category());
  }

  categoryRequiresVehicle(): boolean {
    return this.requiresVehicleCategories.has(this.category());
  }

  isFuel(): boolean {
    return this.category() === 'Fuel';
  }

  editCategoryRequiresUser(): boolean {
    return this.requiresUserCategories.has(this.editCategory());
  }

  editCategoryRequiresVehicle(): boolean {
    return this.requiresVehicleCategories.has(this.editCategory());
  }

  consultationId = signal<string | null>(null);
  cartItemId = signal<string | null>(null);
  selectedClientLabel = signal('');
  selectedClientAvailable = signal<number | null>(null);
  clientPostedTotal = signal(0);
  clientPostedCount = signal(0);

  loadClientPostedTotal(consultationId: string | null) {
    if (!consultationId) {
      this.clientPostedTotal.set(0);
      this.clientPostedCount.set(0);
      return;
    }
    this.expenseService.getExpenses({
      consultation_id: consultationId,
      page: 1,
      page_size: 100,
    }).subscribe({
      next: (res) => {
        const items = res?.items ?? [];
        this.clientPostedCount.set(items.length);
        this.clientPostedTotal.set(items.reduce((sum, x) => sum + (x.amount || 0) + (x.charges || 0), 0));
      },
      error: () => {
        this.clientPostedTotal.set(0);
        this.clientPostedCount.set(0);
      },
    });
  }

  permitCartItems = signal<{ id: string; product_id: string; package_id: string | null; product_name?: string | null; package_name?: string | null; requires_permit_processing: boolean }[]>([]);
  cartExpenseTypes = signal<{ category: string; amount: number; already_paid: boolean }[]>([]);
  cartExpenseTypeLoading = signal(false);
  hasCartExpenseTypes = computed(() => this.cartExpenseTypes().length > 0);

  cartItemLabel(ci: { id: string; product_id: string; package_id: string | null; product_name?: string | null; package_name?: string | null; requires_permit_processing: boolean }): string {
    const name = ci.package_name || ci.product_name || `Cart item (${ci.id.slice(0, 8)})`;
    return ci.requires_permit_processing ? `✓ ${name} — permit` : name;
  }

  permitCartItemOptions = computed(() =>
    this.permitCartItems().map(ci => ({
      label: this.cartItemLabel(ci),
      value: ci.id,
    }))
  );

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Paid', value: 'paid' },
  ];
  categories = signal<ExpenseCategory[]>([]);
  categoryOptions = computed(() => {
    if (this.hasCartExpenseTypes()) {
      const opts = this.cartExpenseTypes().map((t) => ({
        label: t.already_paid ? `${t.category} — already filed` : (t.amount > 0 ? `${t.category} (${this.money(t.amount)})` : t.category),
        value: t.category,
        disabled: t.already_paid,
      }));
      return [...opts, { label: 'Other', value: 'Other', disabled: false }];
    }
    const opts = this.categories().map((c) => ({ label: c.name, value: c.name, disabled: false }));
    return [...opts, { label: 'Other', value: 'Other', disabled: false }];
  });

  constructor() {
    this.loadExpenses();
    this.loadBranches();
    this.loadCategoryAccounts();
    this.route.queryParams.subscribe((params: any) => {
      const cid = params['consultation_id'];
      if (!cid) return;
      this.routeConsultationId.set(cid);
      this.routeCartItem.set(params['cart_item_id'] || '');
      this.routeCategory = params['category'] || '';
      this.backUrl = params['back'] || '/permits';
      this.tab.set('expenses');
      this.loadExpenses();
      this.setupPermitContext(cid);
    });
  }

  private setupPermitContext(cid: string) {
    this.consultationService.get(cid).toPromise()
      .then((c) => {
        if (!c) return;
        this.contextClientLabel.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
        if (c.branch_id) this.contextClientBranch.set(c.branch_id);
        this.contextReadyConsultation = true;
        this.doTryOpenCreate();
      })
      .catch(() => {});
  }

  private doTryOpenCreate() {
    if (this.contextPrefilled()) return;
    if (!this.routeConsultationId()) return;
    if (!this.contextReadyConsultation || !this.contextReadyCategories) return;
    this.contextPrefilled.set(true);
    this.checkExistingExpenseThenOpen();
  }

  private checkExistingExpenseThenOpen() {
    const inContext = !!this.routeConsultationId();
    if (!inContext) { this.openCreate(); return; }
    if (!this.routeCategory) {
      this.openCreateForContext();
      return;
    }
    this.expenseService.getExpenses({
      consultation_id: this.routeConsultationId(),
      category: this.routeCategory || null,
      page: 1,
      page_size: 5,
    }).subscribe({
      next: (res) => {
        if (res.items && res.items.length > 0) {
          return;
        }
        this.openCreateForContext();
      },
      error: () => {
        this.openCreateForContext();
      },
    });
  }

  private openCreateForContext() {
    this.openCreate();
    if (this.routeCategory) this.category.set(this.routeCategory);
    const branchId = this.contextClientBranch() || this.branchId();
    if (branchId) this.branchId.set(branchId);
    this.consultationId.set(this.routeConsultationId());
    this.cartItemId.set(this.routeCartItem() || null);
    this.selectedClientLabel.set(this.contextClientLabel());
    this.loadPermitCartItems(this.routeConsultationId());
    if (this.cartItemId()) this.onCartItemChange(this.cartItemId()!);
    this.loadVehiclesForBranch();
    this.loadClientAccountDetail();
  }

  private loadPermitCartItems(consultationId: string) {
    this.http.get<any[]>(`/api/v1/consultations/${consultationId}/cart-items`).subscribe({
      next: (items) => {
        this.permitCartItems.set(
          (items || [])
            .filter((ci: any) => ci.requires_permit_processing)
            .map((ci: any) => ({
              id: ci.id,
              product_id: ci.product_id,
              package_id: ci.package_id ?? null,
              product_name: ci.product_name ?? null,
              package_name: ci.package_name ?? null,
              requires_permit_processing: !!ci.requires_permit_processing,
            })),
        );
      },
      error: () => this.permitCartItems.set([]),
    });
  }

  backToPrevious() {
    this.router.navigateByUrl(this.backUrl || '/permits');
  }

  private loadCategoryAccounts() {
    this.expenseService.listExpenseCategories().subscribe({
      next: (res) => {
        const meta = new Map<string, string>();
        const clientAcc = new Set<string>();
        const clientReq = new Set<string>();
        const userReq = new Set<string>();
        const vehicleReq = new Set<string>();
        for (const c of res.items ?? []) {
          meta.set(c.name, c.account || 'petty_cash');
          if ((c.account || 'petty_cash') === 'client_accounts') clientAcc.add(c.name);
          if (c.requires_client) clientReq.add(c.name);
          if (c.requires_user) userReq.add(c.name);
          if (c.requires_vehicle) vehicleReq.add(c.name);
        }
        this.categoriesMeta = meta;
        this.requiresUserCategories = userReq;
        this.requiresVehicleCategories = vehicleReq;
        this.categories.set((res.items ?? []).filter((c) => c.is_active));
        this.contextReadyCategories = true;
        this.doTryOpenCreate();
      },
      error: () => {},
    });
  }

  categoryRequiresClient(): boolean {
    return this.requiresClientCategories.has(this.category());
  }

  private isPermitCategory(): boolean {
    const cat = (this.category() || '').toLowerCase();
    return cat.includes('permit') || cat.includes('test booking')
      || cat.includes('police booking') || cat.includes('iov');
  }

  selectClientAccount(p: UnremittedClientPayment) {
    this.consultationId.set(p.consultation_id);
    this.selectedClientLabel.set(`${p.client_name || p.client_phone} · ${p.client_phone}`);
    this.selectedClientAvailable.set(p.amount ?? 0);
    this.clientAccountSearch.set('');
    this.applyClientAccountPaymentFilter();
    this.loadClientPostedTotal(p.consultation_id);
    if (p.consultation_id) this.loadPermitCartItems(p.consultation_id);
  }

  clearClient() {
    this.consultationId.set(null);
    this.cartItemId.set(null);
    this.selectedClientLabel.set('');
    this.selectedClientAvailable.set(null);
    this.clientAccountSearch.set('');
    this.permitCartItems.set([]);
    this.cartExpenseTypes.set([]);
    this.cartExpenseTypeLoading.set(false);
    this.loadClientPostedTotal(null);
    this.applyClientAccountPaymentFilter();
  }

  onCartItemChange(itemId: string) {
    this.cartItemId.set(itemId);
    this.cartExpenseTypes.set([]);
    if (!itemId) {
      this.loadClientAccountDetail();
      return;
    }
    this.cartExpenseTypeLoading.set(true);
    this.http.get<any>(`/api/v1/cart-items/${itemId}/expected-expenses`).subscribe({
      next: (res) => {
        this.cartExpenseTypes.set(res.items || []);
        const payable = (res.items || []).filter((t: any) => !t.already_paid);
        const currentCategory = (this.category() || '').toLowerCase();
        const currentMatch = payable.find((t: any) => t.category.toLowerCase() === currentCategory);
        if (currentMatch) {
          // Keep the user's already-selected category; auto-fill its expected amount.
          this.category.set(currentMatch.category);
          this.amount.set(currentMatch.amount);
        } else if (!this.category() && payable.length === 1) {
          // Only auto-select when the user hasn't already picked a category.
          this.category.set(payable[0].category);
          this.amount.set(payable[0].amount);
        }
        // Never wipe the already-selected category or client here.
        this.loadClientAccountDetail();
        this.cartExpenseTypeLoading.set(false);
      },
      error: () => {
        this.cartExpenseTypes.set([]);
        this.cartExpenseTypeLoading.set(false);
        this.loadClientAccountDetail();
      },
    });
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
    return !!(this.cartItemId() || this.requiresClientCategories.has(this.category()) || this.isClientAccountCategory());
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
    const inContext = !!this.routeConsultationId();
    this.expenseService
      .getExpenses({
        branch_id: this.branchId(),
        status: isSms ? 'paid' : (this.statusFilter() || null),
        category: isSms
          ? SMS_CATEGORY
          : inContext && this.routeCategory
            ? this.routeCategory
            : (this.categoryFilter() || null),
        category_not: isSms ? null : SMS_CATEGORY,
        consultation_id: inContext ? this.routeConsultationId() : null,
        date_from: this.dateFromFilter() || null,
        date_to: this.dateToFilter() || null,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.expenses.set(res.items ?? []);
          this.total.set(res.total ?? 0);
          this.statusTotals.set(res.status_totals ?? {});
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

  setCategoryFilter(value: string) {
    this.categoryFilter.set(value || '');
    this.page.set(1);
    this.loadExpenses();
  }

  onDateFromFilter(date: Date | null) {
    this.dateFromFilter.set(date ? toISODate(date) : '');
    this.page.set(1);
    this.loadExpenses();
  }

  onDateToFilter(date: Date | null) {
    this.dateToFilter.set(date ? toISODate(date) : '');
    this.page.set(1);
    this.loadExpenses();
  }

  clearFilters() {
    this.statusFilter.set('');
    this.categoryFilter.set('');
    this.dateFromFilter.set('');
    this.dateToFilter.set('');
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
    this.instructorId.set(null);
    this.instructors.set([]);
    this.vehicles.set([]);
    if (this.branches().length > 0 && !this.branchId()) {
      this.branchId.set(this.branches()[0].id);
    }
    this.clientAccountAvailable.set(0);
    this.clientAccountPayments.set([]);
    this.clientAccountPaymentsFiltered.set([]);
    this.clientAccountSearch.set('');
    this.permitCartItems.set([]);
    this.cartExpenseTypes.set([]);
    this.cartExpenseTypeLoading.set(false);
    this.clearClient();
    this.loadVehiclesForBranch();
    this.loadInstructors();
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
    const expected = this.expectedAmountForCategory();
    if (expected !== null) {
      this.amount.set(expected);
      this.loadClientAccountDetail();
      return;
    }
    this.clearClient();
    this.loadClientAccountDetail();
  }

  expectedAmountForCategory(): number | null {
    if (!this.cartItemId() || !this.hasCartExpenseTypes()) return null;
    const low = (this.category() || '').toLowerCase();
    if (!low) return null;
    const match = this.cartExpenseTypes().find(t => t.category.toLowerCase() === low);
    if (!match || match.already_paid) return null;
    return match.amount;
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
    if (!(this.category() || '').trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Select a category' });
      return;
    }
    if (amount == null || amount <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Enter a valid amount' });
      return;
    }
    const expected = this.expectedAmountForCategory();
    if (expected !== null && amount + (this.charges() || 0) > expected + 0.001) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Exceeds allocation',
        detail: `Amount + charges cannot exceed ${this.money(expected)} (the package allocation for ${this.category()}).`,
      });
      return;
    }
    if (this.needsClient() && !this.consultationId()) {
      this.messageService.add({ severity: 'warn', summary: 'Select a client for this expense' });
      return;
    }
    if (this.isPermitCategory() && this.permitCartItems().length > 0 && !this.cartItemId()) {
      this.messageService.add({ severity: 'warn', summary: 'Select the cart item for this expense' });
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
    if ((this.isFuel() || this.categoryRequiresVehicle()) && !this.vehicleId()) {
      this.messageService.add({ severity: 'warn', summary: 'Select the vehicle for this expense' });
      return;
    }
    this.submitting.set(true);
    const fuel = this.category() === 'Fuel' || this.categoryRequiresUser();
    const payload: ExpenseCreatePayload = {
      branch_id: branchId,
      amount,
      charges: this.charges() || 0,
      description: this.description() || undefined,
      category: this.category() || undefined,
      vehicle_id: this.isFuel() || this.categoryRequiresVehicle() ? (this.vehicleId() ?? undefined) : undefined,
      instructor_id: fuel ? (this.instructorId() ?? undefined) : undefined,
      mileage: this.isFuel() || this.categoryRequiresVehicle() ? (this.mileage() ?? undefined) : undefined,
      consultation_id: this.consultationId() ?? undefined,
      cart_item_id: this.cartItemId() ?? undefined,
      expense_date: this.expenseDate(),
      status: 'pending',
    };
    this.uploadThenCreate(payload);
  }

  private docDateISO(expense: Expense): string {
    if (!expense.expense_date) return todayISO();
    const d = new Date(expense.expense_date);
    return Number.isNaN(d.getTime()) ? todayISO() : toISODate(d);
  }

  openApprove(expense: Expense) {
    this.approvingExpense.set(expense);
    this.approveDate.set(this.docDateISO(expense));
    this.showApproveDialog.set(true);
  }

  onApproveDateChange(date: Date | null) {
    if (date) this.approveDate.set(toISODate(date));
  }

  submitApprove() {
    const expense = this.approvingExpense();
    if (!expense) return;
    this.approving.set(true);
    this.expenseService
      .approveExpense(expense.id, { approved_at: this.approveDate() || undefined })
      .subscribe({
        next: (updated) => {
          this.approving.set(false);
          this.showApproveDialog.set(false);
          this.expenses.update(list => list.map(x => x.id === updated.id ? updated : x));
          this.messageService.add({ severity: 'success', summary: 'Expense approved' });
        },
        error: (err) => {
          this.approving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Could not approve',
            detail: err.error?.detail || 'Try again',
          });
        },
      });
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
    this.payDate.set(expense.paid_at ? toISODate(new Date(expense.paid_at)) : this.docDateISO(expense));
    this.showPayDialog.set(true);
  }

  openEditDates(expense: Expense) {
    this.datesExpense.set(expense);
    this.editExpenseDate.set(this.docDateISO(expense));
    this.editApprovalDate.set(expense.approved_at ? toISODate(new Date(expense.approved_at)) : null);
    this.editPaymentDate.set(expense.paid_at ? toISODate(new Date(expense.paid_at)) : null);
    this.showDatesDialog.set(true);
  }

  onEditExpenseDateChange(date: Date | null) {
    this.editExpenseDate.set(date ? toISODate(date) : null);
  }

  onEditApprovalDateChange(date: Date | null) {
    this.editApprovalDate.set(date ? toISODate(date) : null);
  }

  onEditPaymentDateChange(date: Date | null) {
    this.editPaymentDate.set(date ? toISODate(date) : null);
  }

  submitEditDates() {
    const expense = this.datesExpense();
    if (!expense) return;
    const payload: { expense_date?: string; approved_at?: string; paid_at?: string } = {};
    if (this.editExpenseDate() && this.canEditExpenseDate()) payload.expense_date = this.editExpenseDate()!;
    if (this.editApprovalDate() && this.canEditApprovalDate(expense)) payload.approved_at = this.editApprovalDate()!;
    if (this.editPaymentDate() && this.canEditPaymentDate(expense)) payload.paid_at = this.editPaymentDate()!;
    if (!Object.keys(payload).length) {
      this.messageService.add({ severity: 'warn', summary: 'Change a date you are allowed to edit' });
      return;
    }
    this.savingDates.set(true);
    this.expenseService.updateExpenseDates(expense.id, payload).subscribe({
      next: (updated) => {
        this.savingDates.set(false);
        this.showDatesDialog.set(false);
        this.expenses.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Dates updated' });
      },
      error: (err) => {
        this.savingDates.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not update dates',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
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

  onPayDateChange(date: Date | null) {
    if (date) this.payDate.set(toISODate(date));
  }

  private doPay(expense: Expense, charges: number, receiptUrl: string | null) {
    this.expenseService.markPaid(expense.id, {
      charges,
      receipt_url: receiptUrl || undefined,
      paid_at: this.payDate() || undefined,
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

  openEdit(expense: Expense) {
    this.editingExpense.set(expense);
    this.editHadCategory = !!(expense.category && expense.category.trim());
    this.editHadClient = !!expense.consultation_id;
    this.editCategory.set('');
    this.editOtherDetail.set('');
    this.editClientLabel.set(expense.client_name || '');
    this.editClientQuery.set('');
    this.editClientResults.set([]);
    this.editVehicleId.set(expense.vehicle_id || null);
    this.editInstructorId.set(expense.instructor_id || null);
    this.editMileage.set(expense.mileage ?? null);
    this.editAmount.set(expense.amount ?? 0);
    this.editCharges.set(expense.charges ?? 0);
    this.editDescription.set(expense.description || '');
    this.loadInstructors();
    this.showEditDialog.set(true);
  }

  loadInstructors() {
    this.catalog.listUsers({ page_size: 100 }).subscribe({
      next: (res) => {
        const users = res?.users ?? [];
        this.instructors.set(
          this.currentInstructorsFromResponse(users),
        );
      },
      error: () => {},
    });
  }

  private currentInstructorsFromResponse(users: any[]): { label: string; value: string }[] {
    return users
      .filter((u) => u.status === 'active')
      .map((u) => ({
        label: `${u.first_name ?? ''}${u.last_name ? ' ' + u.last_name : ''} · ${u.phone}`.trim(),
        value: u.phone,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  searchEditClient(q: string) {
    this.editClientQuery.set(q);
    const search = (q || '').trim();
    if (search.length < 2) {
      this.editClientResults.set([]);
      return;
    }
    this.editClientSearching.set(true);
    this.consultationService.clientSearch(search).subscribe({
      next: (res) => {
        this.editClientResults.set(res ?? []);
        this.editClientSearching.set(false);
      },
      error: () => {
        this.editClientResults.set([]);
        this.editClientSearching.set(false);
      },
    });
  }

  selectEditClient(c: any) {
    this.editingExpense.update(e => e ? { ...e, consultation_id: c.latest_consultation_id || '' } : e);
    this.editClientLabel.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
    this.editClientResults.set([]);
  }

  openDetails(expense: Expense) {
    this.detailsExpense.set(expense);
    this.showDetailsDialog.set(true);
  }

  viewReceipt(e: Expense) {
    if (!e.receipt_url) return;
    this.expenseService.downloadReceipt(e.receipt_url).subscribe({
      next: (res) => {
        const url = URL.createObjectURL(res);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Could not open receipt' });
      },
    });
  }

  saveEdit() {
    const e = this.editingExpense();
    if (!e) return;
    const payload: ExpenseUpdatePayload = {};
    if (!this.editHadClient && e.consultation_id) payload.consultation_id = e.consultation_id;
    if (!this.editHadCategory) {
      const cat = this.editCategory();
      if (cat === 'Other') payload.category = this.editOtherDetail().trim();
      else if (cat) payload.category = cat;
    }
    if (this.editAmount() !== (e.amount ?? 0)) payload.amount = this.editAmount();
    if (this.editCharges() !== (e.charges ?? 0)) payload.charges = this.editCharges();
    if ((this.editDescription() || '') !== (e.description || '')) payload.description = this.editDescription();
    if ((this.editVehicleId() || '') !== (e.vehicle_id || '')) payload.vehicle_id = this.editVehicleId() || undefined;
    if ((this.editInstructorId() || '') !== (e.instructor_id || '')) payload.instructor_id = this.editInstructorId() || undefined;
    if (this.editMileage() !== (e.mileage ?? null)) payload.mileage = this.editMileage() ?? undefined;
    if (!Object.keys(payload).length) {
      this.messageService.add({ severity: 'warn', summary: 'Nothing to update' });
      return;
    }
    this.loading.set(true);
    this.expenseService.updateExpense(e.id, payload).subscribe({
      next: (updated) => {
        this.loading.set(false);
        this.showEditDialog.set(false);
        this.expenses.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Expense updated' });
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not update',
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

  canEdit(expense: Expense) {
    return this.permissions().includes('expenses.edit');
  }

  canEditExpenseDate(): boolean {
    return this.permissions().includes('expenses.edit');
  }

  canEditApprovalDate(expense: Expense | null): boolean {
    if (!expense) return false;
    return (
      this.permissions().includes('expenses.approve') ||
      (!!expense.approved_by && expense.approved_by === this.auth.currentUserPhone())
    );
  }

  canEditPaymentDate(expense: Expense | null): boolean {
    if (!expense) return false;
    return (
      this.permissions().includes('expenses.pay') ||
      (!!expense.paid_by && expense.paid_by === this.auth.currentUserPhone())
    );
  }

  canEditDates(expense: Expense) {
    return (
      this.canEditExpenseDate() ||
      this.canEditApprovalDate(expense) ||
      this.canEditPaymentDate(expense)
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
