import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  ConsultationService,
  Consultation,
  ClientInfo,
} from '../../core/services/consultation.service';
import { ProductService, Product } from '../../core/services/product.service';
import { CartItemService } from '../../core/services/cart.service';
import { PaymentService, PaymentRead } from '../../core/services/payment.service';
import { DiscountService, Discount } from '../../core/services/discount.service';
import { NotificationRefreshService } from '../../core/services/notification-refresh.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { UserService, User } from '../../core/services/user.service';
import { APP_CONFIG } from '../../core/config';

interface SelectedProduct {
  product: Product;
  packageId: string | null;
  price: number;
  packageName: string;
  selectedDiscount?: Discount | null;
  discountAmount?: number;
}

interface PackageAllocation {
  productIndex: number;
  allocated: number;
}

interface ReceiptItem {
  productName: string;
  packageName: string;
  price: number;
  paid: number;
  balance: number;
}

@Component({
  selector: 'app-clients',
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    TagModule,
    TooltipModule,
    ToastModule,
    SelectModule,
    ConfirmDialogModule,
    DatePickerModule,
    CheckboxModule,
    TableModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './clients.html',
})
export class Clients implements OnInit, OnDestroy {
  readonly config = APP_CONFIG;
  consultations = signal<Consultation[]>([]);
  clientResults = signal<ClientInfo[]>([]);
  products = signal<Product[]>([]);
  loading = signal(false);
  search = signal('');
  stageFilter = signal<string | null>(null);
  page = signal(1);
  pageSize = signal(20);
  total = signal(0);
  totalPages = signal(0);
  isSearching = signal(false);

  showCreateDialog = signal(false);
  createStep = signal(1);
  createdConsultation = signal<Consultation | null>(null);
  convertNow = signal(false);

  branches = signal<Branch[]>([]);

  form: any = {
    phone: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    location: '',
    how_they_knew_us: '',
    notes: '',
    interest_level: '',
    start_date: null,
    document_date: null,
    branch_id: null,
  };

  selectedProduct = signal<Product | null>(null);
  selectedPackageId = signal<string | null>(null);
  selectedProducts = signal<SelectedProduct[]>([]);

  packageAllocations = signal<PackageAllocation[]>([]);
  paymentReceiptNumber = signal('');
  paymentTransactionDate = signal<Date>(new Date());
  paymentInstallments = signal<{ due_date: Date | null; amount: number }[]>([]);

  // Discounts for new consultation payment flow
  applicableDiscounts = signal<Map<string, Discount[]>>(new Map());
  loadingApplicableDiscounts = signal(false);
  showDiscountDialog = signal(false);
  discountDialogIndex = signal<number>(-1);
  discountDialogOptions = signal<Discount[]>([]);

  // Recommender attribution (same default logic as mobile sales)
  users = signal<User[]>([]);
  converterId = signal<string>('');
  primaryRecommenderId = signal<string>('');
  secondaryRecommenderId = signal<string>('');

  userOptions = computed(() => {
    const phone = this.authService.currentUser();
    const name = this.authService.currentUserName();
    const options = this.users().map(u => ({ label: u.name || u.phone, value: u.phone }));
    if (phone && !options.some(o => o.value === phone)) {
      options.unshift({ label: name || phone, value: phone });
    }
    return options;
  });

  // Receipt validation
  receiptChecking = signal(false);
  receiptAvailable = signal<boolean | null>(null);

  // Receipt data after payment
  receiptItems = signal<ReceiptItem[]>([]);
  receiptSystemNumber = signal('');
  receiptManualNumber = signal('');
  receiptPaymentId = signal<string | null>(null);
  receiptPaymentIds: string[] = [];
  receiptTotalPaid = signal(0);
  receiptDate = signal('');
  receiptUserName = signal('');
  receiptInstallments = signal<{ due_date: string; amount: number; product_name: string }[]>([]);

  selectedIds = signal<Set<string>>(new Set());

  private itemId(item: Consultation | ClientInfo): string | null {
    return 'latest_consultation_id' in item ? item.latest_consultation_id : item.id;
  }

  isAllSelected = () => {
    const items = this.displayedResults();
    const ids = items.map(i => this.itemId(i)).filter(Boolean) as string[];
    return ids.length > 0 && ids.every(id => this.selectedIds().has(id));
  };

  isAnySelected = () => this.selectedIds().size > 0;

  toggleSelect(id: string) {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleSelectAll() {
    const items = this.displayedResults();
    const ids = items.map(i => this.itemId(i)).filter(Boolean) as string[];
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(ids));
    }
  }

  showBulkDelete() {
    return this.isAnySelected() && this.authService.hasPermission('consultations.delete');
  }

  confirmBulkDelete() {
    const count = this.selectedIds().size;
    this.confirmationService.confirm({
      message: `Permanently delete ${count} client(s) and ALL associated data (payments, training, lesson plans, etc.)? This CANNOT be undone.`,
      header: 'Delete Clients',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.bulkDelete(),
    });
  }

  async bulkDelete() {
    const ids = [...this.selectedIds()];
    this.loading.set(true);
    try {
      await this.consultationService.bulkDelete(ids).toPromise();
      this.selectedIds.set(new Set());
      await this.loadConsultations();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: `${ids.length} client(s) deleted permanently` });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete clients' });
    } finally {
      this.loading.set(false);
    }
  }

  stages = [
    { label: 'All Stages', value: '' },
    { label: 'Consulting', value: 'consulting' },
    { label: 'Active', value: 'active' },
    { label: 'Completed', value: 'completed' },
    { label: 'Lost', value: 'lost' },
  ];

  interestLevels = [
    { label: 'Very High', value: 'very_high' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Undecided', value: 'undecided' },
    { label: 'Low', value: 'low' },
  ];

  howTheyKnewUsOptions = [
    { label: 'Friend/Family', value: 'Friend/Family' },
    { label: 'Social Media', value: 'Social Media' },
    { label: 'Google Search', value: 'Google Search' },
    { label: 'Walk-in', value: 'Walk-in' },
    { label: 'Radio', value: 'Radio' },
    { label: 'Billboard', value: 'Billboard' },
    { label: 'Other', value: 'Other' },
  ];

  private searchSubject = new Subject<string>();
  private searchSub: Subscription;

  constructor(
    private consultationService: ConsultationService,
    private productService: ProductService,
    private cartItemService: CartItemService,
    private paymentService: PaymentService,
    private discountService: DiscountService,
    private notificationRefresh: NotificationRefreshService,
    public authService: AuthService,
    private companyService: CompanyService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router,
    private userService: UserService,
  ) {
    this.searchSub = this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(q => {
      this.page.set(1);
      const trimmed = q.trim();
      if (trimmed.length >= 2) {
        this.performSearch(trimmed);
      } else {
        this.clientResults.set([]);
        this.isSearching.set(false);
        this.loadConsultations();
      }
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.showCreateDialog()) {
      event.preventDefault();
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    if (this.showCreateDialog() && window.scrollY === 0) {
      // Allow scrolling inside dialog
      const target = event.target as HTMLElement;
      if (!target.closest('.p-dialog-content')) {
        event.preventDefault();
      }
    }
  }

  ngOnInit() {
    this.loading.set(true);
    this.loadConsultations();
    this.loadProducts();
    this.loadBranches();
    this.loadUsers();
  }

  async loadUsers() {
    try {
      const res = await this.userService.list({ status: 'active', page_size: 100 }).toPromise();
      this.users.set(res?.users || []);
    } catch {
      this.users.set([]);
    }
  }

  private loadBranches() {
    this.companyService.list().subscribe(companies => {
      for (const c of companies) {
        this.companyService.listBranches(c.id).subscribe(branches => {
          this.branches.update(existing => [...existing, ...branches]);
        });
      }
    });
  }

  ngOnDestroy() {
    this.searchSub.unsubscribe();
  }

  onSearchInput(value: string) {
    this.search.set(value);
    this.searchSubject.next(value);
  }

  private async performSearch(q: string) {
    this.loading.set(true);
    try {
      const res = await this.consultationService.clientSearch(q).toPromise();
      this.clientResults.set(res || []);
      this.isSearching.set(true);
    } catch {
      this.clientResults.set([]);
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadConsultations() {
    this.loading.set(true);
    try {
      const res = await this.consultationService
        .list({
          search: this.search() || undefined,
          stage: this.stageFilter() || undefined,
          page: this.page(),
          page_size: this.pageSize(),
        })
        .toPromise();
      if (res) {
        this.consultations.set(res.consultations);
        this.total.set(res.total);
        this.totalPages.set(res.total_pages);
        this.isSearching.set(false);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load consultations' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadProducts() {
    try {
      const res = await this.productService.listProducts({ status: 'active', page_size: 100 }).toPromise();
      if (res) this.products.set(res.products);
    } catch { /* non-critical */ }
  }

  async onSearch() {
    this.page.set(1);
    const q = this.search().trim();
    if (!q) {
      this.clientResults.set([]);
      this.isSearching.set(false);
      this.loadConsultations();
      return;
    }
    this.loading.set(true);
    try {
      const res = await this.consultationService.clientSearch(q).toPromise();
      this.clientResults.set(res || []);
      this.isSearching.set(true);
    } catch {
      this.clientResults.set([]);
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed' });
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters() {
    this.search.set('');
    this.stageFilter.set(null);
    this.page.set(1);
    this.clientResults.set([]);
    this.isSearching.set(false);
    this.loadConsultations();
  }

  onPageChange(event: { first: number; rows: number }) {
    this.page.set(Math.floor(event.first / event.rows) + 1);
    this.loadConsultations();
  }

  showCreateButton(): boolean {
    return this.isSearching() && this.clientResults().length === 0 && this.search().trim().length >= 2;
  }

  openCreate() {
    const currentPhone = this.authService.currentUser() || '';
    this.form = {
      phone: this.search(),
      first_name: '',
      middle_name: '',
      last_name: '',
      location: '',
      how_they_knew_us: '',
      notes: '',
      interest_level: '',
      start_date: null,
      document_date: new Date(),
    };
    this.selectedProduct.set(null);
    this.selectedPackageId.set(null);
    this.selectedProducts.set([]);
    this.convertNow.set(false);
    this.packageAllocations.set([]);
    this.paymentReceiptNumber.set('');
    this.paymentTransactionDate.set(new Date());
    this.paymentInstallments.set([]);
    this.createdConsultation.set(null);
    this.receiptChecking.set(false);
    this.receiptAvailable.set(null);
    this.receiptItems.set([]);
    this.receiptSystemNumber.set('');
    this.receiptPaymentId.set(null);
    this.receiptPaymentIds = [];
    this.receiptManualNumber.set('');
    this.receiptTotalPaid.set(0);
    this.receiptDate.set('');
    this.receiptUserName.set('');
    this.receiptInstallments.set([]);
    this.converterId.set(currentPhone);
    this.primaryRecommenderId.set(currentPhone);
    this.secondaryRecommenderId.set(currentPhone);
    this.createStep.set(1);
    this.showCreateDialog.set(true);
  }

  get selectedProductTotal(): number {
    return this.selectedProducts().reduce((sum, sp) => sum + this.discountedPrice(sp), 0);
  }

  get totalAllocated(): number {
    return this.packageAllocations().reduce((sum, a) => sum + a.allocated, 0);
  }

  get unallocatedAmount(): number {
    return Math.max(0, this.selectedProductTotal - this.totalAllocated);
  }

  discountedPrice(sp: SelectedProduct): number {
    return Math.max(0, sp.price - (sp.discountAmount || 0));
  }

  discountDescription(sp: SelectedProduct): string {
    const d = sp.selectedDiscount;
    if (!d) return '';
    if (d.discount_type === 'fixed') return `${d.discount_value.toLocaleString()} UGX`;
    return `${d.discount_value}%`;
  }

  onDiscountChange(sp: SelectedProduct, discount: Discount | null) {
    const index = this.selectedProducts().indexOf(sp);
    if (index < 0) return;
    this.selectedProducts.update(list => {
      const updated = [...list];
      const item = { ...updated[index] };
      item.selectedDiscount = discount || null;
      if (!discount) {
        item.discountAmount = 0;
      } else if (discount.discount_type === 'fixed') {
        item.discountAmount = discount.discount_value;
      } else {
        item.discountAmount = Math.round((item.price * discount.discount_value) / 100);
      }
      updated[index] = item;
      return updated;
    });
    // Cap allocation at new discounted price
    const allocation = this.getAllocation(index);
    const discounted = this.discountedPrice(this.selectedProducts()[index]);
    if (allocation > discounted) {
      this.updateAllocation(index, discounted);
    }
    this.initPaymentInstallments();
  }

  loadApplicableDiscountsForProduct(sp: SelectedProduct, index: number) {
    const key = `${index}:${sp.product.id}:${sp.packageId || ''}`;
    this.discountService.getApplicableDiscountsForProduct(sp.product.id, sp.packageId).subscribe({
      next: (discounts) => {
        const map = new Map(this.applicableDiscounts());
        map.set(key, discounts);
        this.applicableDiscounts.set(map);
      },
      error: () => { /* ignore */ }
    });
  }

  applicableDiscountsFor(sp: SelectedProduct, index: number): Discount[] {
    const key = `${index}:${sp.product.id}:${sp.packageId || ''}`;
    return this.applicableDiscounts().get(key) || [];
  }

  hasApplicableDiscounts(sp: SelectedProduct, index: number): boolean {
    return this.applicableDiscountsFor(sp, index).length > 0;
  }

  openDiscountDialog(index: number) {
    const sp = this.selectedProducts()[index];
    this.discountDialogIndex.set(index);
    this.discountDialogOptions.set(this.applicableDiscountsFor(sp, index));
    this.showDiscountDialog.set(true);
  }

  selectDiscountDialog(discount: Discount) {
    const index = this.discountDialogIndex();
    if (index < 0) return;
    this.onDiscountChange(this.selectedProducts()[index], discount);
    this.showDiscountDialog.set(false);
  }

  removeDiscountDialog(index: number) {
    this.onDiscountChange(this.selectedProducts()[index], null);
  }

  get today(): Date {
    return new Date();
  }

  get canBackdate(): boolean {
    return this.authService.currentUserCanBackdate();
  }

  get paymentMinDate(): Date {
    const doc = this.form.document_date as Date | null;
    return doc || new Date();
  }

  get transactionDateInvalid(): boolean {
    const doc = this.form.document_date as Date | null;
    const tx = this.paymentTransactionDate();
    if (!doc || !tx) return false;
    return this.stripTime(tx) < this.stripTime(doc);
  }

  private stripTime(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  canCompletePayment(): boolean {
    if (this.totalAllocated <= 0) return false;
    const doc = this.form.document_date as Date | null;
    const tx = this.paymentTransactionDate();
    if (!doc || !tx) return false;
    if (this.stripTime(tx) < this.stripTime(doc)) return false;
    const receipt = this.paymentReceiptNumber();
    if (receipt && receipt.trim().length >= 2) {
      if (this.receiptChecking() || this.receiptAvailable() !== true) return false;
    }
    return true;
  }

  getAllocation(index: number): number {
    const alloc = this.packageAllocations().find(a => a.productIndex === index);
    return alloc?.allocated || 0;
  }

  updateAllocation(index: number, amount: number) {
    const sp = this.selectedProducts()[index];
    if (!sp) return;
    const maxForPackage = this.discountedPrice(sp);
    const otherAllocations = this.packageAllocations()
      .filter(a => a.productIndex !== index)
      .reduce((sum, a) => sum + a.allocated, 0);
    const maxAllowed = this.selectedProductTotal - otherAllocations;
    const clamped = Math.max(0, Math.min(amount, maxForPackage, maxAllowed));

    this.packageAllocations.update(list => {
      const existing = list.findIndex(a => a.productIndex === index);
      if (existing >= 0) {
        const updated = [...list];
        updated[existing] = { ...updated[existing], allocated: clamped };
        return updated;
      } else {
        return [...list, { productIndex: index, allocated: clamped }];
      }
    });

    // Auto-suggest installments when allocations change
    this.initPaymentInstallments();
  }

  onAllocationInput(index: number, event: any) {
    this.updateAllocation(index, event.value || 0);
  }

  addSelectedProduct() {
    const product = this.selectedProduct();
    if (!product) return;
    const pkgId = this.selectedPackageId();
    const exists = this.selectedProducts().some(
      sp => sp.product.id === product.id && sp.packageId === (pkgId || null)
    );
    if (exists) {
      this.messageService.add({ severity: 'warn', summary: 'Already added', detail: 'This product is already in the list' });
      return;
    }
    const pkg = pkgId ? product.packages.find(p => p.id === pkgId) : null;
    const price = pkg ? parseFloat(String(pkg.price)) || 0 : 0;
    const packageName = pkg?.name || '';
    this.selectedProducts.update(list => [...list, { product, packageId: pkgId || null, price, packageName }]);
    this.selectedProduct.set(null);
    this.selectedPackageId.set(null);
  }

  removeSelectedProduct(index: number) {
    this.selectedProducts.update(list => list.filter((_, i) => i !== index));
    this.packageAllocations.update(list => list.filter(a => a.productIndex !== index));
  }

  async validateReceipt() {
    const receipt = this.paymentReceiptNumber();
    if (!receipt || receipt.trim().length < 2) {
      this.receiptAvailable.set(null);
      return;
    }
    this.receiptChecking.set(true);
    this.receiptAvailable.set(null);
    try {
      const res = await this.paymentService.checkReceipt(receipt.trim()).toPromise();
      this.receiptAvailable.set(res ? !res.exists : null);
    } catch {
      this.receiptAvailable.set(null);
    } finally {
      this.receiptChecking.set(false);
    }
  }

  async nextStep() {
    if (this.createStep() === 1) {
      if (!this.form.phone || !this.form.first_name) {
        this.messageService.add({ severity: 'error', summary: 'Validation Error', detail: 'Phone and First Name are required' });
        return;
      }
      this.createStep.set(2);
    } else if (this.createStep() === 2) {
      const products = this.selectedProducts();
      if (!products.length) {
        this.messageService.add({ severity: 'warn', summary: 'No products', detail: 'Add at least one product package' });
        return;
      }
      const hasPricedProduct = products.some(sp => sp.price > 0);
      if (!hasPricedProduct) {
        this.messageService.add({ severity: 'warn', summary: 'No priced packages', detail: 'Add at least one product package with a price' });
        return;
      }
      if (this.convertNow()) {
        this.packageAllocations.set([]);
        this.paymentInstallments.set([]);
        this.receiptChecking.set(false);
        this.receiptAvailable.set(null);
        this.applicableDiscounts.set(new Map());
        this.createStep.set(3);
        // Load applicable discounts for each selected product
        this.selectedProducts().forEach((sp, i) => this.loadApplicableDiscountsForProduct(sp, i));
      } else {
        await this.finishCreate();
      }
    }
  }

  prevStep() {
    if (this.createStep() > 1) {
      this.createStep.update(s => s - 1);
    }
  }

  initPaymentInstallments() {
    const balance = this.unallocatedAmount;
    if (balance <= 0) {
      this.paymentInstallments.set([]);
      return;
    }
    const now = new Date();
    const half = Math.ceil(balance / 2);
    this.paymentInstallments.set([
      { due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), amount: half },
      { due_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), amount: balance - half },
    ]);
  }

  addPaymentInstallment() {
    if (this.paymentInstallments().length >= 2) return;
    const balance = this.unallocatedAmount;
    if (balance <= 0) return;
    const sumExisting = this.paymentInstallments().reduce((s, inst) => s + (inst.amount || 0), 0);
    const prefill = Math.max(0, balance - sumExisting);
    if (prefill <= 0) return;
    const last = this.paymentInstallments()[this.paymentInstallments().length - 1];
    const base = last?.due_date ? new Date(last.due_date) : new Date();
    const nextDate = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.paymentInstallments.update(arr => [...arr, { due_date: nextDate, amount: prefill }]);
  }

  removePaymentInstallment(index: number) {
    this.paymentInstallments.update(arr => arr.filter((_, i) => i !== index));
  }

  get totalInstallmentAmount(): number {
    return this.paymentInstallments().reduce((s, i) => s + (i.amount || 0), 0);
  }

  get installmentBalanceMatch(): boolean {
    return this.totalInstallmentAmount >= this.unallocatedAmount;
  }

  async completePayment() {
    if (!this.canCompletePayment()) return;
    if (this.loading()) return;

    this.loading.set(true);
    try {
      // Build items with allocations and installments
      const items = this.selectedProducts().map((sp, i) => {
        const paidNow = this.getAllocation(i);
        const discountedPrice = this.discountedPrice(sp);
        const remaining = Math.max(0, discountedPrice - paidNow);
        // Distribute global installments proportionally across unpaid items
        const totalRemaining = this.unallocatedAmount;
        const insts = totalRemaining > 0 ? this.paymentInstallments().map(inst => ({
          due_date: inst.due_date ? this.formatDate(inst.due_date) : '',
          amount: Math.round(inst.amount * (remaining / totalRemaining)),
        })) : [];
        return {
          product_id: sp.product.id,
          package_id: sp.packageId || undefined,
          allocation: paidNow,
          discount_id: sp.selectedDiscount?.id,
          installments: insts.filter(i => i.amount > 0),
        };
      }).filter(item => item.allocation > 0);

      const payload: any = {
        phone: this.form.phone,
        first_name: this.form.first_name,
      };
      if (this.form.middle_name) payload.middle_name = this.form.middle_name;
      if (this.form.last_name) payload.last_name = this.form.last_name;
      if (this.form.location) payload.location = this.form.location;
      if (this.form.how_they_knew_us) payload.how_they_knew_us = this.form.how_they_knew_us;
      if (this.form.interest_level) payload.interest_level = this.form.interest_level;
      if (this.form.start_date) payload.start_date = this.formatDate(this.form.start_date);
      if (this.form.document_date) payload.document_date = this.formatDate(this.form.document_date);
      if (this.form.notes) payload.notes = this.form.notes;
      if (this.form.branch_id) payload.branch_id = this.form.branch_id;
      payload.items = items;
      payload.payment = {
        receipt_number: this.paymentReceiptNumber() || undefined,
        transaction_date: this.paymentTransactionDate()
          ? this.formatDate(this.paymentTransactionDate())
          : this.formatDate(new Date()),
      };
      payload.converter_id = this.converterId() || undefined;
      payload.primary_recommender_id = this.primaryRecommenderId() || undefined;
      payload.secondary_recommender_id = this.secondaryRecommenderId() || undefined;

      const c = await this.consultationService.createFull(payload).toPromise();
      if (!c) throw new Error('Failed to create consultation');

      // Build receipt data
      const receiptData: ReceiptItem[] = [];
      let totalPaid = 0;
      for (let i = 0; i < this.selectedProducts().length; i++) {
        const sp = this.selectedProducts()[i];
        const allocation = this.getAllocation(i);
        const discountedPrice = this.discountedPrice(sp);
        const remaining = Math.max(0, discountedPrice - allocation);
        totalPaid += allocation;
        receiptData.push({
          productName: sp.product.name,
          packageName: sp.packageName,
          price: discountedPrice,
          paid: allocation,
          balance: remaining,
        });
      }

      // Get system receipt and all payment IDs
      let systemReceipt = '';
      const paymentIds: string[] = [];
      const payments = await this.paymentService.getPaymentsByConsultation(c.id).toPromise();
      if (payments && payments.length > 0) {
        systemReceipt = payments[0].system_receipt_number;
        payments.forEach(p => paymentIds.push(p.id));
      }

      // Build receipt installment data
      const receiptInsts = this.paymentInstallments()
        .filter(inst => inst.due_date && inst.amount > 0)
        .map(inst => ({
          due_date: inst.due_date!.toLocaleDateString(),
          amount: inst.amount,
          product_name: this.selectedProducts().map(sp => sp.product.name).join(', '),
        }));

      this.receiptInstallments.set(receiptInsts);
      this.receiptItems.set(receiptData);
      this.receiptSystemNumber.set(systemReceipt);
      this.receiptPaymentId.set(paymentIds.length ? paymentIds[0] : null);
      this.receiptPaymentIds = paymentIds;
      this.receiptManualNumber.set(this.paymentReceiptNumber());
      this.receiptTotalPaid.set(totalPaid);
      this.receiptDate.set(new Date().toLocaleDateString());
      this.receiptUserName.set(this.authService.currentUserName() || 'System');
      this.createdConsultation.set(c);
      this.createStep.set(4);

      // Refresh notification bell if any pending discount was applied
      if (this.selectedProducts().some(sp => sp.selectedDiscount?.status === 'pending')) {
        this.notificationRefresh.trigger();
      }
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || err?.message || 'Failed to process payment' });
    } finally {
      this.loading.set(false);
    }
  }

  private async finishCreate() {
    this.loading.set(true);
    try {
      const payload: any = {
        phone: this.form.phone,
        first_name: this.form.first_name,
      };
      if (this.form.middle_name) payload.middle_name = this.form.middle_name;
      if (this.form.last_name) payload.last_name = this.form.last_name;
      if (this.form.location) payload.location = this.form.location;
      if (this.form.how_they_knew_us) payload.how_they_knew_us = this.form.how_they_knew_us;
      if (this.form.interest_level) payload.interest_level = this.form.interest_level;
      if (this.form.start_date) payload.start_date = this.formatDate(this.form.start_date);
      if (this.form.document_date) payload.document_date = this.formatDate(this.form.document_date);
      if (this.form.notes) payload.notes = this.form.notes;
      if (this.form.branch_id) payload.branch_id = this.form.branch_id;
      const c = await this.consultationService.create(payload).toPromise();
      if (!c) throw new Error('Failed to create consultation');

      if (!this.convertNow()) {
        for (const sp of this.selectedProducts()) {
          await this.cartItemService.create(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
            converter_id: this.converterId() || undefined,
            primary_recommender_id: this.primaryRecommenderId() || undefined,
            secondary_recommender_id: this.secondaryRecommenderId() || undefined,
          }).toPromise();
        }
      }

      this.showCreateDialog.set(false);
      this.search.set(this.form.phone);
      await this.onSearch();
      this.router.navigate(['/consultations', c.id]);
      this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Consultation created successfully' });
    } catch (err: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.detail || err?.message || 'Failed to create consultation' });
    } finally {
      this.loading.set(false);
    }
  }

  viewClient() {
    const c = this.createdConsultation();
    this.showCreateDialog.set(false);
    if (c) {
      this.search.set(this.form.phone);
      this.onSearch();
      this.router.navigate(['/consultations', c.id]);
    }
  }

  closeReceipt() {
    this.showCreateDialog.set(false);
    if (this.form.phone) {
      this.search.set(this.form.phone);
      this.onSearch();
    }
  }

  openReceipt(paymentId: string) {
    this.paymentService.getReceipt(paymentId).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  downloadReceipt(paymentId: string) {
    this.paymentService.getReceipt(paymentId, true).subscribe({
      next: (html) => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${paymentId}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download receipt' }),
    });
  }

  reprintReceipt(paymentId: string) {
    this.paymentService.getReceipt(paymentId).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => {
            try { win.print(); } catch { /* fallback */ }
          }, 800);
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  private get consultationIdForReceipt(): string {
    const c = this.createdConsultation();
    return c?.id || '';
  }

  openConsolidatedReceipt(receiptNumber: string) {
    const cid = this.consultationIdForReceipt;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  reprintConsolidatedReceipt(receiptNumber: string) {
    const cid = this.consultationIdForReceipt;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid).subscribe({
      next: (html) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => {
            try { win.print(); } catch { /* fallback */ }
          }, 800);
        }
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receipt' }),
    });
  }

  downloadConsolidatedReceipt(receiptNumber: string) {
    const cid = this.consultationIdForReceipt;
    if (!cid) return;
    this.paymentService.getConsolidatedReceipt(receiptNumber, cid, true).subscribe({
      next: (html) => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt-${receiptNumber}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download receipt' }),
    });
  }

  printReceipt() {
    const receiptContent = document.getElementById('receipt-content');
    if (!receiptContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: monospace; padding: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd; }
        .header { text-align: center; margin-bottom: 20px; }
        .total { font-weight: bold; border-top: 2px solid #000; }
      </style></head><body>
      ${receiptContent.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  confirmDeactivate(consultation: Consultation) {
    this.confirmationService.confirm({
      message: `Deactivate this consultation for ${consultation.first_name}?`,
      header: 'Deactivate Consultation',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deactivate(consultation),
    });
  }

  async deactivate(consultation: Consultation) {
    try {
      await this.consultationService.deactivate(consultation.id).toPromise();
      await this.loadConsultations();
      this.messageService.add({ severity: 'success', summary: 'Deactivated', detail: 'Consultation marked as lost' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to deactivate' });
    }
  }

  fullName(c: { first_name: string; middle_name?: string | null; last_name?: string | null }): string {
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ');
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'contrast' {
    switch (s) {
      case 'new': return 'info';
      case 'consulting': return 'warn';
      case 'active': return 'success';
      case 'converted_new': case 'converted_upsold': case 'converted_completed': return 'success';
      case 'lost': return 'danger';
      default: return 'contrast';
    }
  }

  stageLabel(c: Consultation): string {
    const items = c.cart_items || [];
    const hasPaid = items.some(ci => ci.status === 'converted_paid' || ci.status === 'converted_paying');
    const allCompleted = items.length > 0 && items.every(ci => ci.status === 'converted_completed');
    const allLost = items.length > 0 && items.every(ci => ci.status === 'lost');
    if (allCompleted) return 'Completed';
    if (allLost) return 'Lost';
    if (hasPaid) return 'Active';
    return 'Consulting';
  }

  displayedResults() {
    if (this.isSearching()) return this.clientResults();
    return this.consultations();
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
