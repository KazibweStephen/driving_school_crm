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
import { FinanceService, Expense, ExpenseCreate, ExpenseCategory, UnremittedClientPayment } from '../../core/services/finance.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { VehicleService, Vehicle } from '../../core/services/vehicle.service';
import { toLocalDateStr } from '../../shared/utils/date.utils';
import { ConsultationService, ClientInfo } from '../../core/services/consultation.service';
import { CartItemService, CartItemRead, CartItemExpectedExpenseType } from '../../core/services/cart.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserDisplayCmp } from '../../shared/components/user-display';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

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
  loading = signal(false);
  showDialog = signal(false);
  editing = signal<Expense | null>(null);
  total = 0;
  page = 1;
  pageSize = 20;
  filterStatus = signal<string>('');
  filterBranch = signal<string>('');
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

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private vehicleService: VehicleService,
    private consultationService: ConsultationService,
    private cartItemService: CartItemService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    public currencyService: CurrencyService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadBranches();
    this.loadExpenses();
    this.loadCategories();
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
      mileage: null,
      consultation_id: '',
      cart_item_id: '',
      expense_date: new Date(),
    };
    this.clientResults.set([]);
    this.clientQuery.set('');
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
        category: inContext ? (this.routeCategory || undefined) : undefined,
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

  confirmApprove(e: Expense) {
    this.confirmationService.confirm({
      message: `Approve expense "${e.description || e.category || 'Untitled'}" for ${this.currencyService.symbol()} ${e.amount}?`,
      header: 'Approve Expense',
      icon: 'pi pi-check-circle',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.approve(e.id),
    });
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

  async approve(id: string) {
    try {
      const updated = await this.financeService.approveExpense(id).toPromise();
      if (updated) {
        this.expenses.update(list => list.map(x => x.id === id ? updated : x));
        this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Expense approved' });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve expense' });
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
    this.showPayDialog.set(true);
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
      const updated = await this.financeService.markExpensePaid(e.id, {
        charges: this.payCharges() || 0,
        receipt_url,
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
