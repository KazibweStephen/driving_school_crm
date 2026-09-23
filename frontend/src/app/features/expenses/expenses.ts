import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FinanceService, Expense, ExpenseCreate, ExpenseUpdate, ExpenseCategory, UnremittedClientPayment } from '../../core/services/finance.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';
import { toLocalDateStr } from '../../shared/utils/date.utils';
import { ConsultationService, ClientInfo } from '../../core/services/consultation.service';
import { CartItemService, CartItemRead, CartItemExpectedExpenseType } from '../../core/services/cart.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserDisplayCmp } from '../../shared/components/user-display';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { AuthService } from '../../core/auth/auth.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-expenses',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, ConfirmDialogModule, TableModule, TagModule, TooltipModule, DatePickerModule, UserDisplayCmp,
    HasPermissionDirective,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './expenses.html',
})
export class ExpensesCmp implements OnInit {
  expenses = signal<Expense[]>([]);
  branches = signal<Branch[]>([]);
  vehicles = signal<Vehicle[]>([]);
  vehicleOptions = computed(() =>
    this.vehicles().map(v => ({ id: v.id, label: `${v.plate_number} · ${v.transmission}` }))
  );
  instructors = signal<{ id: string; label: string }[]>([]);
  loading = signal(false);
  showDialog = signal(false);
  editing = signal<Expense | null>(null);
  total = 0;
  page = 1;
  pageSize = 20;
  filterStatus = signal<string>('');
  filterBranch = signal<string>('');
  filterCategory = signal<string>('');
  filterDateFrom = signal<Date | null>(null);
  filterDateTo = signal<Date | null>(null);
  categoryFilterOptions = computed(() =>
    this.categories().map(c => ({ label: c.name, value: c.name }))
  );
  receiptFile = signal<File | null>(null);
  uploading = signal(false);
  showRejectDialog = signal(false);
  rejectingExpense = signal<Expense | null>(null);
  rejectReason = signal('');
  showPayDialog = signal(false);
  payingExpense = signal<Expense | null>(null);
  payCharges = signal(0);
  payReceiptFile = signal<File | null>(null);
  payingUpload = signal(false);
  payDate = signal<Date | null>(null);
  showApproveDialog = signal(false);
  approvingExpense = signal<Expense | null>(null);
  approveDate = signal<Date | null>(null);
  approving = signal(false);
  showDatesDialog = signal(false);
  datesExpense = signal<Expense | null>(null);
  editExpenseDate = signal<Date | null>(null);
  editApprovalDate = signal<Date | null>(null);
  editPaymentDate = signal<Date | null>(null);
  savingDates = signal(false);

  // Permit-stage navigation context (query params: consultation_id, cart_item_id, category, back)
  routeConsultationId = signal<string>('');
  routeCartItem = signal<string>('');
  routeCategory = '';
  backUrl = '';
  contextClientLabel = signal('');
  contextPrefilled = signal(false);
  contextReadyConsultation = false;
  contextReadyCategories = false;

  categories = signal<ExpenseCategory[]>([]);
  categoryOptions = computed(() => {
    if (this.hasCartExpenseTypes()) {
      const opts = this.cartExpenseTypes().map(t => ({
        label: t.already_paid ? `${t.category} — already filed` : (t.amount > 0 ? `${t.category} (${t.amount.toLocaleString()})` : t.category),
        value: t.category,
        requires_client: false,
        disabled: t.already_paid,
      }));
      return [...opts, { label: 'Other', value: '__other__', requires_client: false, disabled: false }];
    }
    const opts = this.categories().map(c => ({
      label: c.name,
      value: c.name,
      requires_client: c.requires_client,
      disabled: false,
    }));
    return [...opts, { label: 'Other', value: '__other__', requires_client: false, disabled: false }];
  });
  selectedCategory(): { label: string; value: string; requires_client: boolean } | null {
    return this.categoryOptions().find(c => c.value === this.form.category) ?? null;
  }

  selectedCategoryRequiresUser(): boolean {
    if (this.hasCartExpenseTypes()) return false;
    const cat = this.categories().find(c => c.name === this.form.category);
    return !!cat?.requires_user;
  }

  editCategoryRequiresUser(): boolean {
    const cat = this.categories().find(c => c.name === this.editCategory());
    return !!cat?.requires_user;
  }

  selectedCategoryRequiresVehicle(): boolean {
    if (this.hasCartExpenseTypes() && !this.isFuel()) return false;
    const cat = this.categories().find(c => c.name === this.form.category);
    return !!cat?.requires_vehicle;
  }

  editCategoryRequiresVehicle(): boolean {
    const cat = this.categories().find(c => c.name === this.editCategory());
    return !!cat?.requires_vehicle;
  }

  isFuel(): boolean {
    return this.form.category === 'Fuel';
  }

  selectedCategoryAccount(): string {
    if (this.form.category === '__other__') return 'petty_cash';
    const cat = this.categories().find(c => c.name === this.form.category);
    return cat?.account || 'petty_cash';
  }

  isClientAccountCategory(): boolean {
    return this.selectedCategoryAccount() === 'client_accounts';
  }

  needsClient(): boolean {
    return !!(this.form.cart_item_id || this.selectedCategory()?.requires_client || this.isClientAccountCategory());
  }

  async loadClientAccountDetail() {
    if (this.isClientAccountCategory() && this.form.branch_id) {
      this.clientAccountAccountLoading.set(true);
      this.clientAccountPayments.set([]);
      this.clientAccountPaymentsFiltered.set([]);
      try {
        const positions = (await this.financeService.getCashPosition().toPromise()) || [];
        const branch = positions.find(p => p.branch_id === this.form.branch_id);
        const pool = branch?.pools?.find(p => p.pool === 'client_accounts');
        this.clientAccountAvailable.set(pool?.net_in_hand ?? 0);
      } catch {
        this.clientAccountAvailable.set(0);
      }
      try {
        const payments = (await this.financeService.getUnremittedClientPayments(this.form.branch_id).toPromise()) || [];
        this.clientAccountPayments.set(payments);
        this.applyClientAccountPaymentFilter();
      } catch {
        this.clientAccountPayments.set([]);
        this.clientAccountPaymentsFiltered.set([]);
      } finally {
        this.clientAccountAccountLoading.set(false);
      }
    } else {
      this.clientAccountAvailable.set(0);
      this.clientAccountPayments.set([]);
      this.clientAccountPaymentsFiltered.set([]);
    }
  }

  applyClientAccountPaymentFilter() {
    const q = (this.clientAccountPaymentsSearch() || '').trim().toLowerCase();
    const all = this.clientAccountPayments();
    if (!q) {
      this.clientAccountPaymentsFiltered.set(all);
      return;
    }
    this.clientAccountPaymentsFiltered.set(all.filter(p =>
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.client_phone || '').toLowerCase().includes(q)
    ));
  }

  onClientAccountSearch(value: string) {
    this.clientAccountPaymentsSearch.set(value);
    this.applyClientAccountPaymentFilter();
  }

  canFundFromClientAccount(): boolean {
    return (this.form.amount ?? 0) <= this.clientAccountAvailable() + 0.001;
  }

  clientResults = signal<ClientInfo[]>([]);
  clientSearching = signal(false);
  clientQuery = signal('');
  clientPostedTotal = signal(0);
  clientPostedCount = signal(0);
  clientPostedLoading = signal(false);

  // Details dialog
  showDetailsDialog = signal(false);
  detailsExpense = signal<Expense | null>(null);

  // Edit dialog — fills MISSING category & client; lets rights-holders also
  // edit instructor/vehicle/mileage/amount/charges/description on Fuel expenses.
  showEditDialog = signal(false);
  editingExpense = signal<Expense | null>(null);
  editCategory = signal('');
  editOtherDetail = signal('');
  editClientLabel = signal('');
  editClientResults = signal<ClientInfo[]>([]);
  editClientSearching = signal(false);
  editClientQuery = signal('');
  editHadCategory = false;
  editHadClient = false;
  editVehicleId = signal('');
  editInstructorId = signal('');
  editMileage = signal<number | null>(null);
  editAmount = signal(0);
  editCharges = signal(0);
  editDescription = signal('');
  editPostedTotal = signal(0);
  editPostedCount = signal(0);

  canBackdate(): boolean {
    return this.authService.currentUserCanBackdate();
  }

  editCategoryOptions = computed(() => {
    const opts = this.categories().map(c => ({ label: c.name, value: c.name }));
    return [...opts, { label: 'Other', value: '__other__' }];
  });

  editCanSave(): boolean {
    const e = this.editingExpense();
    if (!e) return false;
    const needsCategory = !this.editHadCategory;
    const needsClient = !this.editHadClient;
    if (needsCategory && !this.editCategory()) return false;
    if (needsCategory && this.editCategory() === '__other__' && !this.editOtherDetail().trim()) return false;
    if (needsCategory || needsClient) return true;
    // If category/client already set, allow saving when a fillable field changed.
    return this.fieldsChanged();
  }

  fieldsChanged(): boolean {
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

  permitCartItems = signal<CartItemRead[]>([]);
  permitCartItemOptions = computed(() =>
    this.permitCartItems().map(ci => ({
      label: this.cartItemLabel(ci),
      value: ci.id,
    }))
  );

  cartExpenseTypes = signal<CartItemExpectedExpenseType[]>([]);
  cartExpenseTypeLoading = signal(false);
  hasCartExpenseTypes = computed(() => this.cartExpenseTypes().length > 0);

  cartItemLabel(ci: CartItemRead): string {
    const name = ci.package_name || ci.product_name || `Cart item (${ci.id.slice(0, 8)})`;
    return ci.requires_permit_processing ? `✓ ${name} — permit` : name;
  }

  clientAccountAvailable = signal(0);
  clientAccountAccountLoading = signal(false);
  clientAccountPayments = signal<UnremittedClientPayment[]>([]);
  clientAccountPaymentsFiltered = signal<UnremittedClientPayment[]>([]);
  clientAccountPaymentsSearch = signal('');
  clientAccountSearchFocus = signal('set');

  form = {
    branch_id: '',
    amount: 0,
    charges: 0,
    description: '',
    category: '',
    otherDetail: '',
    vehicle_id: '',
    instructor_id: '',
    mileage: null as number | null,
    consultation_id: '',
    cart_item_id: '',
    expense_date: new Date(),
  };

  severityMap: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
    pending: 'warn',
    approved: 'success',
    rejected: 'danger',
    paid: 'info',
  };

  today = new Date();

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private vehicleService: VehicleService,
    private consultationService: ConsultationService,
    private cartItemService: CartItemService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    public currencyService: CurrencyService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.loadBranches();
    this.loadExpenses();
    this.loadCategories();
    this.loadInstructors();
    this.route.queryParams.subscribe((params: any) => {
      const cid = params['consultation_id'];
      if (!cid) return;
      this.routeConsultationId.set(cid);
      this.routeCartItem.set(params['cart_item_id'] || '');
      this.routeCategory = params['category'] || '';
      this.backUrl = params['back'] || '/permits';
      this.loadExpenses();
      this.setupPermitContext(cid);
    });
  }

  private setupPermitContext(cid: string) {
    this.consultationService.get(cid).toPromise()
      .then((c) => {
        if (!c) return;
        this.contextClientLabel.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
        this.prefillForm.branch_id = c.branch_id || '';
        this.prefillForm.consultation_id = cid;
        this.contextReadyConsultation = true;
        this.doTryOpenCreate();
      })
      .catch(() => {});
  }

  private prefillForm = {
    branch_id: '',
    consultation_id: '',
  };

  openCreate() {
    this.editing.set(null);
    this.form = {
      branch_id: '',
      amount: 0,
      charges: 0,
      description: '',
      category: '',
      otherDetail: '',
      vehicle_id: '',
      instructor_id: '',
      mileage: null,
      consultation_id: '',
      cart_item_id: '',
      expense_date: new Date(),
    };
    this.clientResults.set([]);
    this.clientQuery.set('');
    this.clientPostedTotal.set(0);
    this.clientPostedCount.set(0);
    this.receiptFile.set(null);
    this.vehicles.set([]);
    this.permitCartItems.set([]);
    this.cartExpenseTypes.set([]);
    this.showDialog.set(true);
  }

  private doTryOpenCreate() {
    if (this.contextPrefilled()) return;
    if (!this.routeConsultationId()) return;
    if (!this.contextReadyConsultation || !this.contextReadyCategories) return;
    this.contextPrefilled.set(true);
    // Check if an existing expense already exists for this consultation+category+cart_item
    this.checkExistingExpenseThenOpen();
  }

  private checkExistingExpenseThenOpen() {
    const inContext = !!this.routeConsultationId();
    if (!inContext) { this.openCreate(); return; }
    // For stages with a specific category (Learner Permit Payment, Permit Payment),
    // check if an expense already exists — don't open create dialog if so.
    // For testing stage (no category — 3 separate expenses needed), always open.
    if (!this.routeCategory) {
      this.openCreateForContext();
      return;
    }
    this.financeService.listExpenses({
      consultation_id: this.routeConsultationId(),
      category: this.routeCategory,
      page: 1,
      page_size: 5,
    }).subscribe({
      next: (res) => {
        if (res.items && res.items.length > 0) {
          // Existing expense found — don't open create dialog
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
    if (this.routeCategory) this.form.category = this.routeCategory;
    if (this.prefillForm.branch_id) this.form.branch_id = this.prefillForm.branch_id;
    if (this.prefillForm.consultation_id) {
      this.form.consultation_id = this.prefillForm.consultation_id;
      this.form.cart_item_id = this.routeCartItem() || '';
      this.clientQuery.set(this.contextClientLabel());
      this.loadPermitCartItems(this.prefillForm.consultation_id);
      this.loadClientPostedTotal(this.prefillForm.consultation_id);
      if (this.form.cart_item_id) this.onCartItemChange(this.form.cart_item_id);
    }
    this.loadVehiclesForBranch();
    this.loadClientAccountDetail();
  }

  private loadPermitCartItems(consultationId: string) {
    this.cartItemService.list(consultationId).subscribe({
      next: (items) => {
        this.permitCartItems.set(items.filter(ci => ci.requires_permit_processing));
      },
      error: () => this.permitCartItems.set([]),
    });
  }

  backToPrevious() {
    this.router.navigateByUrl(this.backUrl || '/permits');
  }

  private loadCategories() {
    this.financeService.listExpenseCategories().subscribe({
      next: (res) => {
        this.categories.set(res.items);
        this.contextReadyCategories = true;
        this.doTryOpenCreate();
      },
      error: () => {},
    });
  }

  loadInstructors() {
    this.userService.list({ role: 'instructor', status: 'active', page_size: 100 }).subscribe({
      next: (res) => {
        this.instructors.set((res?.users || []).map(u => ({
          id: u.phone,
          label: `${u.name || u.first_name || u.phone} · ${u.phone}`,
        })));
      },
      error: () => this.instructors.set([]),
    });
  }

  async loadClientPostedTotal(consultationId: string) {
    if (!consultationId) {
      this.clientPostedTotal.set(0);
      this.clientPostedCount.set(0);
      return;
    }
    this.clientPostedLoading.set(true);
    try {
      const res = await this.financeService.listExpenses({
        consultation_id: consultationId,
        page: 1,
        page_size: 100,
      }).toPromise();
      const items = res?.items || [];
      this.clientPostedCount.set(items.length);
      this.clientPostedTotal.set(items.reduce((sum, e) => sum + (e.amount || 0) + (e.charges || 0), 0));
    } catch {
      this.clientPostedTotal.set(0);
      this.clientPostedCount.set(0);
    } finally {
      this.clientPostedLoading.set(false);
    }
  }

  private loadBranches() {
    this.companyService.list().subscribe({
      next: (companies) => {
        for (const c of companies) {
          this.companyService.listBranches(c.id).subscribe({
            next: (branches) => this.branches.set([...this.branches(), ...branches]),
          });
        }
      },
    });
  }

  async loadExpenses() {
    this.loading.set(true);
    try {
      const inContext = !!this.routeConsultationId();
      const res = await this.financeService.listExpenses({
        branch_id: this.filterBranch() || undefined,
        status: this.filterStatus() || undefined,
        consultation_id: inContext ? this.routeConsultationId() : undefined,
        category: inContext
          ? (this.routeCategory || undefined)
          : (this.filterCategory() || undefined),
        date_from: this.dateParam(this.filterDateFrom()),
        date_to: this.dateParam(this.filterDateTo()),
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.expenses.set(res.items);
        this.total = res.total;
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load expenses' });
    } finally {
      this.loading.set(false);
    }
  }

  onPage(event: any) {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadExpenses();
  }

  dateParam(d: Date | null): string | undefined {
    return d ? toLocalDateStr(d) : undefined;
  }

  resetAndLoad() {
    this.page = 1;
    this.loadExpenses();
  }

  clearFilters() {
    this.filterBranch.set('');
    this.filterStatus.set('');
    this.filterCategory.set('');
    this.filterDateFrom.set(null);
    this.filterDateTo.set(null);
    this.resetAndLoad();
  }

  onBranchChangeInDialog() {
    this.loadVehiclesForBranch();
    this.loadClientAccountDetail();
  }

  onCategoryChangeInDialog() {
    // When filing a tagged expense (cart item selected + category matches one
    // of the package's expected expense types), auto-fill the amount from the
    // expected allocation for that category, and keep the client/cart context.
    const expected = this.expectedAmountForCategory();
    if (expected !== null) {
      this.form.amount = expected;
      this.loadClientAccountDetail();
      return;
    }
    this.clientResults.set([]);
    this.clientQuery.set('');
    this.form.consultation_id = '';
    this.loadClientAccountDetail();
  }

  expectedAmountForCategory(): number | null {
    if (!this.form.cart_item_id || !this.hasCartExpenseTypes()) return null;
    const low = (this.form.category || '').toLowerCase();
    if (!low) return null;
    const match = this.cartExpenseTypes().find(t => t.category.toLowerCase() === low);
    if (!match || match.already_paid) return null;
    return match.amount;
  }

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.receiptFile.set(input.files[0]);
      input.value = '';
    }
  }

  removeReceipt() {
    this.receiptFile.set(null);
  }

  async save() {
    this.loading.set(true);
    try {
      let receipt_url: string | undefined;
      if (this.receiptFile()) {
        this.uploading.set(true);
        const uploadRes = await this.financeService.uploadReceipt(this.receiptFile()!).toPromise();
        receipt_url = uploadRes?.url;
        this.uploading.set(false);
      }

      const f = this.form;
      const category = f.category === '__other__' ? f.otherDetail.trim() : f.category;
      const payload: ExpenseCreate = {
        branch_id: f.branch_id,
        amount: f.amount,
        charges: f.charges || 0,
        description: f.description,
        category,
        mileage: f.mileage ?? undefined,
        vehicle_id: f.vehicle_id || undefined,
        instructor_id: f.instructor_id || undefined,
        consultation_id: f.consultation_id || undefined,
        cart_item_id: f.cart_item_id || undefined,
        expense_date: f.expense_date instanceof Date
          ? toLocalDateStr(f.expense_date)
          : f.expense_date,
        receipt_url,
      };
      await this.financeService.createExpense(payload).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Expense created' });
      this.showDialog.set(false);
      await this.loadExpenses();
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.error?.detail || 'Failed to create expense',
      });
    } finally {
      this.loading.set(false);
      this.uploading.set(false);
    }
  }

  openApprove(e: Expense) {
    this.approvingExpense.set(e);
    this.approveDate.set(this.docDate(e));
    this.showApproveDialog.set(true);
  }

  confirmReject(e: Expense) {
    this.rejectingExpense.set(e);
    this.rejectReason.set('');
    this.showRejectDialog.set(true);
  }

  confirmDelete(e: Expense) {
    this.confirmationService.confirm({
      message: `Delete expense "${e.description || e.category || 'Untitled'}" for ${this.currencyService.symbol()} ${e.amount}? This cannot be undone.`,
      header: 'Delete Expense',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.remove(e.id),
    });
  }

  private docDate(e: Expense): Date {
    const d = e.expense_date ? new Date(e.expense_date) : new Date();
    return Number.isNaN(d.getTime()) ? this.toLocalDateOnly(new Date()) : this.toLocalDateOnly(d);
  }

  async submitApprove() {
    const e = this.approvingExpense();
    if (!e) return;
    this.approving.set(true);
    try {
      const ad = this.approveDate();
      const approved_at = ad ? toLocalDateStr(ad) : undefined;
      const updated = await this.financeService.approveExpense(e.id, { approved_at }).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === e.id ? updated : x));
        this.showApproveDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Expense approved' });
      }
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to approve expense' });
    } finally {
      this.approving.set(false);
    }
  }

  async reject() {
    const e = this.rejectingExpense();
    const reason = this.rejectReason().trim();
    if (!e || !reason) return;
    try {
      const updated = await this.financeService.rejectExpense(e.id, reason).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === e.id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Rejected', detail: 'Expense rejected' });
      }
      this.showRejectDialog.set(false);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to reject expense' });
    }
  }

  openPay(e: Expense) {
    this.payingExpense.set(e);
    this.payCharges.set(e.charges ?? 0);
    this.payReceiptFile.set(null);
    this.payDate.set(e.paid_at ? this.toLocalDateOnly(new Date(e.paid_at)) : this.docDate(e));
    this.showPayDialog.set(true);
  }

  // Date edits are available to the respective people: document date to
  // expenses.edit, approval date to the approver (or expenses.approve), and
  // payment date to the payer (or expenses.pay).
  canEditExpenseDate(): boolean {
    return this.authService.hasPermission('expenses.edit');
  }

  canEditApprovalDate(e: Expense | null): boolean {
    if (!e) return false;
    return this.authService.hasPermission('expenses.approve')
      || (!!e.approved_by && e.approved_by === this.authService.currentUser());
  }

  canEditPaymentDate(e: Expense | null): boolean {
    if (!e) return false;
    return this.authService.hasPermission('expenses.pay')
      || (!!e.paid_by && e.paid_by === this.authService.currentUser());
  }

  canEditDates(e: Expense): boolean {
    return this.canEditExpenseDate()
      || this.canEditApprovalDate(e)
      || this.canEditPaymentDate(e);
  }

  openEditDates(e: Expense) {
    this.datesExpense.set(e);
    this.editExpenseDate.set(this.docDate(e));
    this.editApprovalDate.set(e.approved_at ? this.toLocalDateOnly(new Date(e.approved_at)) : null);
    this.editPaymentDate.set(e.paid_at ? this.toLocalDateOnly(new Date(e.paid_at)) : null);
    this.showDatesDialog.set(true);
  }

  openDetails(e: Expense) {
    this.detailsExpense.set(e);
    this.showDetailsDialog.set(true);
  }

  async submitEditDates() {
    const e = this.datesExpense();
    if (!e) return;
    const payload: { expense_date?: string; approved_at?: string; paid_at?: string } = {};
    const dd = this.editExpenseDate();
    const ad = this.editApprovalDate();
    const pd = this.editPaymentDate();
    if (dd && this.canEditExpenseDate()) payload.expense_date = toLocalDateStr(dd);
    if (ad && this.canEditApprovalDate(e)) payload.approved_at = toLocalDateStr(ad);
    if (pd && this.canEditPaymentDate(e)) payload.paid_at = toLocalDateStr(pd);
    if (!Object.keys(payload).length) {
      this.messageService.add({ severity: 'warn', summary: 'Nothing to update', detail: 'Change a date you are allowed to edit.' });
      return;
    }
    this.savingDates.set(true);
    try {
      const updated = await this.financeService.updateExpenseDates(e.id, payload).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === e.id ? updated : x));
        this.showDatesDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Dates updated', detail: 'Expense dates saved' });
      }
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || 'Failed to update dates' });
    } finally {
      this.savingDates.set(false);
    }
  }

  private toLocalDateOnly(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  async onPayReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.payReceiptFile.set(file);
    input.value = '';
  }

  async submitPayment() {
    const e = this.payingExpense();
    if (!e) return;
    this.payingUpload.set(true);
    try {
      let receipt_url: string | undefined;
      if (this.payReceiptFile()) {
        const uploadRes = await this.financeService.uploadReceipt(this.payReceiptFile()!).toPromise();
        receipt_url = uploadRes?.url;
      }
      const pd = this.payDate();
      const paid_at = pd ? toLocalDateStr(pd) : undefined;
      const updated = await this.financeService.markExpensePaid(e.id, {
        charges: this.payCharges() || 0,
        receipt_url,
        paid_at,
      }).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === e.id ? updated : x));
        this.showPayDialog.set(false);
        this.messageService.add({ severity: 'success', summary: 'Paid', detail: 'Expense marked as paid' });
      }
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.error?.detail || 'Failed to mark expense as paid',
      });
    } finally {
      this.payingUpload.set(false);
    }
  }

  openEdit(e: Expense) {
    this.editingExpense.set(e);
    this.editCategory.set('');
    this.editOtherDetail.set('');
    this.editClientLabel.set(e.client_name || '');
    this.editClientQuery.set('');
    this.editClientResults.set([]);
    this.editVehicleId.set(e.vehicle_id || '');
    this.editInstructorId.set(e.instructor_id || '');
    this.editMileage.set(e.mileage ?? null);
    this.editAmount.set(e.amount ?? 0);
    this.editCharges.set(e.charges ?? 0);
    this.editDescription.set(e.description || '');
    this.editPostedTotal.set(0);
    this.editPostedCount.set(0);
    this.editHadCategory = !!(e.category && e.category.trim());
    this.editHadClient = !!e.consultation_id;
    if (e.consultation_id) this.loadClientPostedTotalForEdit(e.consultation_id);
    this.showEditDialog.set(true);
  }

  async loadClientPostedTotalForEdit(consultationId: string) {
    if (!consultationId) return;
    try {
      const res = await this.financeService.listExpenses({
        consultation_id: consultationId,
        page: 1,
        page_size: 100,
      }).toPromise();
      const items = res?.items || [];
      this.editPostedCount.set(items.length);
      this.editPostedTotal.set(items.reduce((sum, x) => sum + (x.amount || 0) + (x.charges || 0), 0));
    } catch {
      this.editPostedTotal.set(0);
      this.editPostedCount.set(0);
    }
  }

  onEditCategoryChange() {
    this.editClientResults.set([]);
  }

  async searchEditClient(q: string) {
    this.editClientQuery.set(q);
    const search = (q || '').trim();
    if (search.length < 2) {
      this.editClientResults.set([]);
      return;
    }
    this.editClientSearching.set(true);
    try {
      const res = await this.consultationService.clientSearch(search).toPromise();
      this.editClientResults.set(res || []);
    } catch {
      this.editClientResults.set([]);
    } finally {
      this.editClientSearching.set(false);
    }
  }

  selectEditClient(c: ClientInfo) {
    this.editingExpense.update(e => e ? { ...e, consultation_id: c.latest_consultation_id || '' } : e);
    this.editClientLabel.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
    this.editClientResults.set([]);
    if (c.latest_consultation_id) this.loadClientPostedTotalForEdit(c.latest_consultation_id);
  }

  async saveEdit() {
    const e = this.editingExpense();
    if (!e) return;
    this.loading.set(true);
    try {
      const payload: ExpenseUpdate = {};
      if (!this.editHadClient && e.consultation_id) payload.consultation_id = e.consultation_id;
      if (!this.editHadCategory) {
        const cat = this.editCategory();
        if (cat === '__other__') payload.category = this.editOtherDetail().trim();
        else if (cat) payload.category = cat;
      }
      if (this.editAmount() !== (e.amount ?? 0)) payload.amount = this.editAmount();
      if (this.editCharges() !== (e.charges ?? 0)) payload.charges = this.editCharges();
      if ((this.editDescription() || '') !== (e.description || '')) payload.description = this.editDescription();
      if ((this.editVehicleId() || '') !== (e.vehicle_id || '')) payload.vehicle_id = this.editVehicleId() || undefined;
      if ((this.editInstructorId() || '') !== (e.instructor_id || '')) payload.instructor_id = this.editInstructorId() || undefined;
      if (this.editMileage() !== (e.mileage ?? null)) payload.mileage = this.editMileage() ?? undefined;
      if (!Object.keys(payload).length) {
        this.messageService.add({ severity: 'warn', summary: 'Nothing to update', detail: 'No changes were made.' });
        this.loading.set(false);
        return;
      }
      const updated = await this.financeService.updateExpense(e.id, payload).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === e.id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Expense updated' });
      }
      this.showEditDialog.set(false);
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.error?.detail || 'Failed to update expense',
      });
    } finally {
      this.loading.set(false);
    }
  }

  async remove(id: string) {
    try {
      await this.financeService.deleteExpense(id).toPromise();
      this.expenses.update(list => list.filter(x => x.id !== id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Expense deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete expense' });
    }
  }

  formIsValid(): boolean {
    if (!this.form.category) return false;
    if (this.expectedAmountForCategory() !== null) {
      const expected = this.expectedAmountForCategory()!;
      const total = (this.form.amount ?? 0) + (this.form.charges || 0);
      if (total > expected + 0.001) return false;
    }
    if (!this.form.branch_id || (this.form.amount ?? 0) <= 0) return false;
    if (this.form.category === '__other__' && !this.form.otherDetail.trim()) return false;
    if (this.selectedCategory()?.requires_client && !this.form.consultation_id) return false;
    if (this.isClientAccountCategory() && !this.canFundFromClientAccount()) return false;
    // Require cart item for permit-related categories when the selected
    // client has permit-processing cart items (tagged-expense flow).
    if (this.isPermitCategory() && this.permitCartItems().length > 0 && !this.form.cart_item_id) return false;
    return true;
  }

  private isPermitCategory(): boolean {
    const cat = (this.form.category || '').toLowerCase();
    return cat.includes('permit') || cat.includes('test booking')
      || cat.includes('police booking') || cat.includes('iov');
  }

  onClientQueryChange(q: string) {
    this.clientQuery.set(q);
    this.searchClient(q);
  }

  async searchClient(q: string) {
    this.clientQuery.set(q);
    const search = (q || '').trim();
    if (search.length < 2) {
      this.clientResults.set([]);
      return;
    }
    this.clientSearching.set(true);
    try {
      const res = await this.consultationService.clientSearch(search).toPromise();
      this.clientResults.set(res || []);
    } catch {
      this.clientResults.set([]);
    } finally {
      this.clientSearching.set(false);
    }
  }

  selectClient(c: ClientInfo) {
    this.form.consultation_id = c.latest_consultation_id || '';
    this.form.cart_item_id = '';
    this.cartExpenseTypes.set([]);
    this.clientQuery.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
    this.clientResults.set([]);
    this.loadClientPostedTotal(this.form.consultation_id || '');
    if (!c.latest_consultation_id) {
      this.permitCartItems.set([]);
      this.messageService.add({ severity: 'warn', summary: 'No consultation', detail: 'This client has no consultation to attach' });
    } else {
      this.loadPermitCartItems(c.latest_consultation_id);
    }
  }

  clearClient() {
    this.form.consultation_id = '';
    this.form.cart_item_id = '';
    this.cartExpenseTypes.set([]);
    this.permitCartItems.set([]);
    this.clientQuery.set('');
    this.clientResults.set([]);
    this.clientPostedTotal.set(0);
    this.clientPostedCount.set(0);
  }

  onCartItemChange(itemId: string) {
    this.form.cart_item_id = itemId;
    this.cartExpenseTypes.set([]);
    if (!itemId) {
      this.loadClientAccountDetail();
      return;
    }
    this.cartExpenseTypeLoading.set(true);
    this.cartItemService.getExpectedExpenses(itemId).subscribe({
      next: (res) => {
        this.cartExpenseTypes.set(res.items || []);
        const payable = (res.items || []).filter(t => !t.already_paid);
        const currentCategory = (this.form.category || '').toLowerCase();
        const currentMatch = payable.find(t => t.category.toLowerCase() === currentCategory);
        if (currentMatch) {
          // Keep the user's already-selected category; auto-fill its expected amount.
          this.form.category = currentMatch.category;
          this.form.amount = currentMatch.amount;
        } else if (!this.form.category && payable.length === 1) {
          // Only auto-select when the user hasn't already picked a category.
          this.form.category = payable[0].category;
          this.form.amount = payable[0].amount;
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

  loadVehiclesForBranch() {
    if (!this.form.branch_id) return;
    this.vehicleService.list({ status: 'available' }).subscribe({
      next: (vehicles) => {
        this.vehicles.set(vehicles.filter(v => v.branch_ids?.includes(this.form.branch_id)));
      },
    });
  }

  formatDate(d: string): string {
    return d ? new Date(d).toLocaleDateString() : '';
  }

  formatDateTime(d: string | undefined): string {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async viewReceipt(e: Expense) {
    if (!e.receipt_url) return;
    const filename = e.receipt_url.split('/').pop() || '';
    try {
      const blob = await this.financeService.downloadExpenseReceipt(filename).toPromise();
      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load receipt' });
    }
  }
}
