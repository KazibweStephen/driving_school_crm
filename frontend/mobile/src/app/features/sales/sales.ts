import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
  ClientSummary,
  Consultation,
  CartItem,
  FullConsultationItem,
} from '../../core/services/consultation.service';
import { CatalogService, Product, Package, User } from '../../core/services/catalog.service';
import { PaymentService, BranchInfo, PaymentRead } from '../../core/services/payment.service';
import { DiscountService, Discount } from '../../core/services/discount.service';
import { ClientSearch } from '../../shared/client-search/client-search';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { addDays, formatMoney, toISODate, todayISO } from '../../shared/format';

interface SaleItem {
  product: Product;
  package: Package | null;
  price: number;
  allocation: number;
  installments: { amount: number; due_date: string }[];
  cartItemId?: string;
  selectedDiscount?: Discount | null;
  discountAmount?: number;
}

type Step = 'home' | 'client' | 'products' | 'payment' | 'consulting' | 'done';
type SaleMode = 'sale' | 'consulting';
type SalesTab = 'active' | 'consultations';

@Component({
  selector: 'app-sales',
  imports: [
    FormsModule,
    DecimalPipe,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
    DialogModule,
    ClientSearch,
    LoadingOverlay,
    PageHeader,
  ],
  templateUrl: './sales.html',
})
export class Sales {
  private auth = inject(AuthService);
  private consultationService = inject(ConsultationService);
  private catalogService = inject(CatalogService);
  private paymentService = inject(PaymentService);
  private discountService = inject(DiscountService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;
  Math = Math;

  get today(): Date {
    return new Date();
  }

  private dateCache = new Map<string, Date>();

  parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    let date = this.dateCache.get(value);
    if (!date) {
      date = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
      this.dateCache.set(value, date);
    }
    return date;
  }

  step = signal<Step>('home');
  isPrevious = signal(false);
  loading = signal(false);
  submitting = signal(false);

  products = signal<Product[]>([]);
  productsLoaded = false;
  colleagues = signal<User[]>([]);

  productSearch = signal('');
  filteredProducts = computed(() => {
    const q = this.productSearch().trim().toLowerCase();
    if (!q) return this.products();
    return this.products().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.duration_label ?? '').toLowerCase().includes(q),
    );
  });

  colleagueOptions = computed(() =>
    this.colleagues().map((u) => ({
      label: u.name ? `${u.name} · ${u.phone}` : u.phone,
      phone: u.phone,
    })),
  );

  // home tabs: active clients + consultations
  salesTab = signal<SalesTab>('active');
  activeClients = signal<ClientSummary[]>([]);
  consultations = signal<Consultation[]>([]);
  activeSearch = signal('');
  consultationSearch = signal('');
  activeLoading = signal(false);
  consultationLoading = signal(false);
  activeServerHits = signal(false);
  consultationServerHits = signal(false);

  filteredActiveClients = computed(() => {
    const q = this.activeSearch().trim().toLowerCase();
    if (!q) return this.activeClients();
    return this.activeClients().filter((c) =>
      `${c.first_name} ${c.middle_name ?? ''} ${c.last_name ?? ''} ${c.phone}`
        .toLowerCase()
        .includes(q),
    );
  });

  filteredConsultations = computed(() => {
    const q = this.consultationSearch().trim().toLowerCase();
    if (!q) return this.consultations();
    return this.consultations().filter((c) =>
      `${c.first_name} ${c.middle_name ?? ''} ${c.last_name ?? ''} ${c.phone}`
        .toLowerCase()
        .includes(q),
    );
  });

  // existing-client prompt (new sale)
  showExistingDialog = signal(false);
  existingClientMatch: ClientInfo | null = null;

  constructor() {
    this.route.queryParams.subscribe((qp) => {
      if (qp['upsell'] === '1' && qp['id']) {
        this.startUpsellDeepLink(qp['id']);
      }
    });
  }

  ngOnInit() {
    this.loadActiveClients();
    this.loadConsultations();
  }

  setSalesTab(tab: SalesTab) {
    this.salesTab.set(tab);
  }

  onActiveSearch(q: string) {
    this.activeSearch.set(q);
    const term = q.trim();
    if (term === '') {
      this.activeServerHits.set(false);
      this.loadActiveClients();
      return;
    }
    if (term.length >= 2 && this.filteredActiveClients().length === 0) {
      this.activeLoading.set(true);
      this.consultationService.listClients({ search: term, page_size: 50 }).subscribe({
        next: (res) => {
          const hits = res.clients ?? [];
          this.activeServerHits.set(hits.length > 0);
          if (hits.length) this.activeClients.set(hits);
          this.activeLoading.set(false);
        },
        error: () => this.activeLoading.set(false),
      });
    }
  }

  onConsultationSearch(q: string) {
    this.consultationSearch.set(q);
    const term = q.trim();
    if (term === '') {
      this.consultationServerHits.set(false);
      this.loadConsultations();
      return;
    }
    if (term.length >= 2 && this.filteredConsultations().length === 0) {
      this.consultationLoading.set(true);
      this.consultationService.list({ search: term, page_size: 50 }).subscribe({
        next: (res) => {
          const hits = res.consultations ?? [];
          this.consultationServerHits.set(hits.length > 0);
          if (hits.length) this.consultations.set(hits);
          this.consultationLoading.set(false);
        },
        error: () => this.consultationLoading.set(false),
      });
    }
  }

  openClient(client: ClientSummary) {
    this.router.navigate(['/sales'], { queryParams: { upsell: '1', id: client.id } });
  }

  openConsultation(c: Consultation) {
    this.router.navigate(['/sales'], { queryParams: { upsell: '1', id: c.id } });
  }

  private loadActiveClients() {
    this.consultationService.listClients({ page_size: 50 }).subscribe({
      next: (res) => this.activeClients.set(res.clients ?? []),
      error: () => this.activeClients.set([]),
    });
  }

  private loadConsultations() {
    this.consultationService.list({ page_size: 50 }).subscribe({
      next: (res) => this.consultations.set(res.consultations ?? []),
      error: () => this.consultations.set([]),
    });
  }

  private async startUpsellDeepLink(id: string) {
    if (this.step() !== 'home') return;
    this.isNewSale.set(false);
    this.isPrevious.set(false);
    this.resetFlow();
    this.step.set('client');
    this.loading.set(true);
    if (!this.productsLoaded) await this.loadProducts();
    if (this.branches().length === 0) this.loadBranches();
    if (this.colleagues().length === 0) this.loadColleagues();
    this.consultationService.get(id).subscribe({
      next: async (consultation) => {
        this.client = {
          phone: consultation.phone,
          first_name: consultation.first_name,
          middle_name: consultation.middle_name,
          last_name: consultation.last_name,
          location: consultation.location,
          how_they_knew_us: consultation.how_they_knew_us,
          interest_level: consultation.interest_level,
          latest_status: consultation.status,
          latest_consultation_id: consultation.id,
        };
        this.existingConsultation.set(consultation);
        this.existingItems.set(
          (consultation.cart_items ?? []).filter((ci) =>
            ['converted_paid', 'converted_paying'].includes(ci.status),
          ),
        );
        await this.preloadConsultationItems(consultation.cart_items ?? []);
        this.loadExistingPayments(consultation.id);
        this.step.set('products');
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Could not load client' });
        this.step.set('home');
      },
    });
  }

  private async preloadConsultationItems(items: CartItem[]) {
    const open = (items ?? []).filter((ci) =>
      ['interested', 'consulting'].includes(ci.status),
    );
    if (open.length === 0) return;
    const saleItems: SaleItem[] = [];
    for (const ci of open) {
      let product = this.products().find((p) => p.id === ci.product_id);
      if (!product) {
        try {
          product = await lastValueFrom(this.catalogService.getProduct(ci.product_id));
        } catch {
          continue;
        }
      }
      const pkg = ci.package_id
        ? (product.packages ?? []).find((pk) => pk.id === ci.package_id) ?? null
        : null;
      const price = pkg ? Number(pkg.price) : 0;
      saleItems.push({
        product,
        package: pkg,
        price,
        allocation: 0,
        installments: [],
        cartItemId: ci.id,
      });
    }
    if (saleItems.length > 0) this.selectedItems.set(saleItems);
  }

  // flow type
  isNewSale = signal(true);
  client: ClientInfo | null = null;
  existingConsultation = signal<Consultation | null>(null);
  existingItems = signal<CartItem[]>([]);
  existingPayments = signal<PaymentRead[]>([]);

  // payment vs consulting mode
  saleMode = signal<SaleMode>('sale');

  // consulting / follow-up fields
  followUpDate = signal<string>(todayISO());
  followUpNote = '';
  converterId = signal<string | null>(null);
  primaryRecommenderId = signal<string | null>(null);
  secondaryRecommenderId = signal<string | null>(null);

  // new client fields
  phone = '';
  firstName = '';
  middleName = '';
  lastName = '';
  location = '';
  howTheyKnewUs = '';
  howTheyKnewUsOptions = [
    'Referral',
    'Social Media',
    'Google',
    'Walk-in',
    'Flyer / Poster',
    'Phone Call',
    'Other',
  ];

  // sale
  selectedItems = signal<SaleItem[]>([]);
  receiptNumber = '';
  branchId = signal<string | null>(null);
  branches = signal<BranchInfo[]>([]);
  documentDate = signal<string>(todayISO());
  documentDateObject = computed(() =>
    this.documentDate() ? new Date(this.documentDate() + 'T00:00:00') : null,
  );

  // result
  resultConsultationId = signal<string | null>(null);

  totalPrice = computed(() => this.selectedItems().reduce((s, i) => s + this.discountedPrice(i), 0));
  totalPaid = computed(() => this.selectedItems().reduce((s, i) => s + i.allocation, 0));
  totalRemaining = computed(() => this.totalPrice() - this.totalPaid());

  applicableDiscounts = signal<Map<string, Discount[]>>(new Map());
  loadingApplicableDiscounts = signal(false);

  discountedPrice(item: SaleItem): number {
    return Math.max(0, item.price - (item.discountAmount || 0));
  }

  discountDescription(item: SaleItem): string {
    const d = item.selectedDiscount;
    if (!d) return '';
    if (d.discount_type === 'fixed') return `${d.discount_value.toLocaleString()} UGX`;
    return `${d.discount_value}%`;
  }

  onDiscountChange(item: SaleItem, discount: Discount | null) {
    item.selectedDiscount = discount || null;
    if (!discount) {
      item.discountAmount = 0;
    } else if (discount.discount_type === 'fixed') {
      item.discountAmount = discount.discount_value;
    } else {
      item.discountAmount = Math.round((item.price * discount.discount_value) / 100);
    }
    // Recompute allocation to cap at discounted price and regenerate schedule
    const discounted = this.discountedPrice(item);
    if (item.allocation > discounted) {
      item.allocation = discounted;
    }
    this.recomputeSchedule(item);
    this.selectedItems.set([...this.selectedItems()]);
  }

  loadApplicableDiscounts(item: SaleItem) {
    const key = item.cartItemId || `${item.product.id}:${item.package?.id || ''}`;
    if (item.cartItemId) {
      this.discountService.getApplicableDiscounts(item.cartItemId).subscribe({
        next: (discounts) => {
          const map = new Map(this.applicableDiscounts());
          map.set(key, discounts);
          this.applicableDiscounts.set(map);
        },
        error: () => { /* ignore */ }
      });
    } else {
      this.discountService.getApplicableDiscountsForProduct(item.product.id, item.package?.id || null).subscribe({
        next: (discounts) => {
          const map = new Map(this.applicableDiscounts());
          map.set(key, discounts);
          this.applicableDiscounts.set(map);
        },
        error: () => { /* ignore */ }
      });
    }
  }

  applicableDiscountsFor(item: SaleItem): Discount[] {
    const key = item.cartItemId || `${item.product.id}:${item.package?.id || ''}`;
    return this.applicableDiscounts().get(key) || [];
  }

  hasApplicableDiscounts(item: SaleItem): boolean {
    return this.applicableDiscountsFor(item).length > 0;
  }

  startFlow(newSale: boolean, previous: boolean) {
    this.isNewSale.set(newSale);
    this.isPrevious.set(previous);
    this.resetFlow();
    this.preselectCurrentUserRoles();
    this.step.set('client');
    if (previous && this.canBackdate()) {
      this.documentDate.set(toISODate(addDays(new Date(), -1)));
    } else {
      this.documentDate.set(todayISO());
    }
    if (!this.productsLoaded) this.loadProducts();
    if (this.branches().length === 0) this.loadBranches();
    if (this.colleagues().length === 0) this.loadColleagues();
  }

  private resetFlow() {
    this.client = null;
    this.existingConsultation.set(null);
    this.existingItems.set([]);
    this.existingPayments.set([]);
    this.phone = '';
    this.firstName = '';
    this.middleName = '';
    this.lastName = '';
    this.location = '';
    this.howTheyKnewUs = '';
    this.selectedItems.set([]);
    this.receiptNumber = '';
    this.resultConsultationId.set(null);
    this.saleMode.set('sale');
    this.productSearch.set('');
    this.followUpDate.set(todayISO());
    this.followUpNote = '';
    this.converterId.set(null);
    this.primaryRecommenderId.set(null);
    this.secondaryRecommenderId.set(null);
  }

  onFollowUpDate(date: Date | null) {
    if (date) this.followUpDate.set(toISODate(date));
  }

  private loadProducts(): Promise<void> {
    return new Promise((resolve) => {
      this.catalogService
        .listProducts({ status: 'active', page_size: 100 })
        .subscribe({
          next: (res) => {
            const active = (res.products ?? []).filter((p) => p.status === 'active');
            this.products.set(active);
            this.productsLoaded = true;
            resolve();
          },
          error: () => {
            this.products.set([]);
            this.productsLoaded = true;
            resolve();
          },
        });
    });
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        this.applyDefaultBranch(branches);
      },
      error: () => {
        this.catalogService.listMyBranches().subscribe((branches) => {
          this.branches.set(branches);
          this.applyDefaultBranch(branches);
        });
      },
    });
  }

  private applyDefaultBranch(branches: BranchInfo[]) {
    this.catalogService.getCurrentUser().subscribe({
      next: (me) => {
        const assigned = (me.branch_ids ?? [])
          .map(String)
          .filter((id) => branches.some((b) => b.id === id));
        if (assigned.length >= 1) this.branchId.set(assigned[0]);
        else if (branches.length >= 1) this.branchId.set(branches[0].id);
      },
      error: () => {
        if (branches.length >= 1) this.branchId.set(branches[0].id);
      },
    });
  }

  private ensureDefaultBranch() {
    if (this.branchId()) return;
    const branches = this.branches();
    if (branches.length === 0) return;
    this.catalogService.getCurrentUser().subscribe({
      next: (me) => {
        const assigned = (me.branch_ids ?? [])
          .map(String)
          .filter((id) => branches.some((b) => b.id === id));
        if (assigned.length >= 1) this.branchId.set(assigned[0]);
        else this.branchId.set(branches[0].id);
      },
      error: () => this.branchId.set(branches[0].id),
    });
  }

  private loadColleagues() {
    this.catalogService.listUsers({ page_size: 100 }).subscribe({
      next: (res) => {
        const users = (res.users ?? []).filter((u) => u.status === 'active');
        this.mergeCurrentUser(users);
      },
      error: () => this.mergeCurrentUser([]),
    });
  }

  private mergeCurrentUser(users: User[]) {
    this.catalogService.getCurrentUser().subscribe({
      next: (me) => {
        if (me && !users.some((u) => u.phone === me.phone)) {
          users = [...users, me];
        }
        this.colleagues.set(users);
      },
      error: () => this.colleagues.set(users),
    });
  }

  private preselectCurrentUserRoles() {
    this.catalogService.getCurrentUser().subscribe({
      next: (me) => {
        this.converterId.set(me.phone);
        this.primaryRecommenderId.set(me.phone);
        this.secondaryRecommenderId.set(me.phone);
      },
      error: () => {},
    });
  }

  private colleagueServerSearch = '';

  onColleagueFilter(event: { filter?: string }) {
    const term = (event.filter ?? '').trim();
    if (term.length < 2) return;
    const localMatch = this.colleagueOptions().some((o) =>
      o.label.toLowerCase().includes(term.toLowerCase()),
    );
    if (localMatch || term === this.colleagueServerSearch) return;
    this.colleagueServerSearch = term;
    this.catalogService.listUsers({ search: term, page_size: 50 }).subscribe({
      next: (res) => {
        const extra = (res.users ?? []).filter(
          (u) => u.status === 'active' && !this.colleagues().some((c) => c.phone === u.phone),
        );
        if (extra.length) this.colleagues.update((list) => [...list, ...extra]);
      },
      error: () => {},
    });
  }

  onClientSelected(client: ClientInfo) {
    this.client = client;
    if (!this.isNewSale() && client.latest_consultation_id) {
      this.loading.set(true);
      this.consultationService.get(client.latest_consultation_id).subscribe({
        next: (consultation) => {
          this.existingConsultation.set(consultation);
          this.existingItems.set(
            (consultation.cart_items ?? []).filter((ci) =>
              ['converted_paid', 'converted_paying'].includes(ci.status),
            ),
          );
          this.loadExistingPayments(consultation.id);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  private loadExistingPayments(consultationId: string) {
    this.paymentService.getPaymentsByConsultation(consultationId).subscribe({
      next: (payments) => {
        this.existingPayments.set(payments ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.existingPayments.set([]);
        this.loading.set(false);
      },
    });
  }

  onDocumentDate(date: Date | null) {
    if (date) this.documentDate.set(toISODate(date));
  }

  isPurchased(product: Product, pkg?: Package): boolean {
    // Fully-paid products cannot be re-added; products with an outstanding
    // balance (converted_paying) can be re-added to collect the balance.
    return this.existingItems().some(
      (ci) =>
        ci.product_id === product.id &&
        (pkg ? ci.package_id === pkg.id : !ci.package_id) &&
        (ci.status === 'converted_paid' || this.existingBalanceForItem(ci) <= 0),
    );
  }

  private existingBalanceItem(product: Product, pkg?: Package): CartItem | null {
    return (
      this.existingItems().find(
        (ci) =>
          ci.product_id === product.id &&
          (pkg ? ci.package_id === pkg.id : !ci.package_id) &&
          ci.status === 'converted_paying' &&
          this.existingBalanceForItem(ci) > 0,
      ) ?? null
    );
  }

  isAdded(product: Product, pkg?: Package): boolean {
    return this.selectedItems().some(
      (i) =>
        i.product.id === product.id &&
        (pkg ? i.package?.id === pkg.id : !i.package),
    );
  }

  existingPaymentsForItem(ci: CartItem): PaymentRead[] {
    return this.existingPayments().filter(
      (p) =>
        p.product_id === ci.product_id &&
        (ci.package_id ? p.package_id === ci.package_id : !p.package_id),
    );
  }

  existingTotalForItem(ci: CartItem): number {
    const pays = this.existingPaymentsForItem(ci);
    if (!pays.length) return 0;
    const sorted = [...pays].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return parseFloat(sorted[0].total_amount);
  }

  existingPaidForItem(ci: CartItem): number {
    return this.existingPaymentsForItem(ci).reduce(
      (s, p) => s + parseFloat(p.total_paid || '0'),
      0,
    );
  }

  existingBalanceForItem(ci: CartItem): number {
    return Math.max(0, this.existingTotalForItem(ci) - this.existingPaidForItem(ci));
  }

  payForExisting(ci: CartItem) {
    const consultation = this.existingConsultation();
    if (!consultation) {
      this.messageService.add({ severity: 'error', summary: 'Client not loaded' });
      return;
    }
    this.router.navigate(['/payments'], {
      queryParams: { consultationId: consultation.id, cartItemId: ci.id },
    });
  }

  addPackage(product: Product, pkg: Package) {
    if (this.selectedItems().some((i) => i.package?.id === pkg.id)) {
      this.messageService.add({ severity: 'info', summary: 'Already added', detail: pkg.name });
      return;
    }
    const balanceItem = this.existingBalanceItem(product, pkg);
    if (balanceItem) {
      const balance = this.existingBalanceForItem(balanceItem);
      const price = Number(pkg.price) || balance;
      this.selectedItems.update((items) => [
        ...items,
        { product, package: pkg, price, allocation: 0, installments: [], cartItemId: balanceItem.id },
      ]);
      return;
    }
    if (this.isPurchased(product, pkg)) {
      this.messageService.add({ severity: 'info', summary: 'Already purchased', detail: pkg.name });
      return;
    }
    const price = Number(pkg.price);
    this.selectedItems.update((items) => [
      ...items,
      { product, package: pkg, price, allocation: 0, installments: [] },
    ]);
  }

  addProductOnly(product: Product) {
    if (this.selectedItems().some((i) => i.product.id === product.id && !i.package)) {
      this.messageService.add({ severity: 'info', summary: 'Already added', detail: product.name });
      return;
    }
    const balanceItem = this.existingBalanceItem(product);
    if (balanceItem) {
      const balance = this.existingBalanceForItem(balanceItem);
      const price = this.existingTotalForItem(balanceItem) || balance;
      this.selectedItems.update((items) => [
        ...items,
        { product, package: null, price, allocation: 0, installments: [], cartItemId: balanceItem.id },
      ]);
      return;
    }
    if (this.isPurchased(product)) {
      this.messageService.add({ severity: 'info', summary: 'Already purchased', detail: product.name });
      return;
    }
    this.selectedItems.update((items) => [
      ...items,
      { product, package: null, price: 0, allocation: 0, installments: [] },
    ]);
  }

  removeItem(index: number) {
    this.selectedItems.update((items) => items.filter((_, i) => i !== index));
  }

  hasPriorPayments(item: SaleItem): boolean {
    return this.existingPaymentsForSaleItem(item).length > 0;
  }

  private existingPaymentsForSaleItem(item: SaleItem): PaymentRead[] {
    return this.existingPayments().filter(
      (p) =>
        p.product_id === item.product.id &&
        (item.package ? p.package_id === item.package.id : !p.package_id),
    );
  }

  private existingBalanceForSaleItem(item: SaleItem): number {
    return this.existingPaymentsForSaleItem(item).reduce(
      (s, p) => s + parseFloat(p.balance || '0'),
      0,
    );
  }

  amountHint(item: SaleItem): string {
    const balance = this.existingBalanceForSaleItem(item);
    if (balance > 0) {
      return `Balance: ${this.money(balance)}`;
    }
    return `Price: ${this.money(this.discountedPrice(item))}`;
  }

  onAllocationChange(item: SaleItem) {
    const base = toISODate(new Date(this.documentDate() + 'T00:00:00'));
    const price = this.discountedPrice(item);
    const remaining = Math.max(0, price - item.allocation);
    let installments: { amount: number; due_date: string }[] = [];
    if (remaining > 0) {
      if (this.hasPriorPayments(item)) {
        // Subsequent payment on the product: push the balance forward into a
        // single future installment (the user can adjust the date).
        installments = [
          { amount: remaining, due_date: toISODate(addDays(new Date(base), 7)) },
        ];
      } else {
        const half = Math.round((remaining / 2) * 100) / 100;
        installments = [
          { amount: half, due_date: toISODate(addDays(new Date(base), 7)) },
          { amount: Math.round((remaining - half) * 100) / 100, due_date: toISODate(addDays(new Date(base), 14)) },
        ];
      }
    }
    this.selectedItems.update((items) =>
      items.map((i) =>
        i === item
          ? { ...i, installments }
          : i,
      ),
    );
  }

  setInstallmentDate(item: SaleItem, index: number, date: Date | null) {
    if (!item.installments[index] || !date) return;
    const dueDate = toISODate(date);
    this.selectedItems.update((items) =>
      items.map((i) =>
        i === item
          ? {
              ...i,
              installments: i.installments.map((inst, idx) =>
                idx === index ? { ...inst, due_date: dueDate } : inst,
              ),
            }
          : i,
      ),
    );
  }

  recomputeSchedule(item: SaleItem) {
    this.onAllocationChange(item);
  }

  backToClient() {
    this.step.set('client');
  }

  backToProducts() {
    this.step.set('products');
  }

  nextToProducts() {
    if (this.isNewSale()) {
      if (!this.phone || !this.firstName) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Missing info',
          detail: 'Enter at least phone and first name',
        });
        return;
      }
      this.validateNewClient();
      return;
    } else {
      if (!this.client || !this.existingConsultation()) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Select a client',
          detail: 'Search and select an existing client to upsell',
        });
        return;
      }
    }
    this.step.set('products');
  }

  private validateNewClient() {
    const phone = this.phone.trim();
    this.loading.set(true);
    this.consultationService.clientSearch(phone).subscribe({
      next: (matches) => {
        this.loading.set(false);
        if (matches && matches.length > 0) {
          this.existingClientMatch = matches[0];
          this.showExistingDialog.set(true);
        } else {
          this.step.set('products');
        }
      },
      error: () => {
        this.loading.set(false);
        this.step.set('products');
      },
    });
  }

  goToConsultations() {
    const m = this.existingClientMatch;
    this.showExistingDialog.set(false);
    if (m?.latest_consultation_id) {
      this.router.navigate(['/consultations', m.latest_consultation_id]);
    } else {
      this.router.navigate(['/sales']);
    }
  }

  continueAsNew() {
    this.showExistingDialog.set(false);
    this.step.set('products');
  }

  nextToPayment() {
    if (this.selectedItems().length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No products',
        detail: 'Add at least one product or package',
      });
      return;
    }
    for (const item of this.selectedItems()) {
      if (item.allocation < 0) item.allocation = 0;
    }
    this.ensureDefaultBranch();
    this.saleMode.set('sale');
    this.step.set('payment');

    // Load applicable discounts for all items
    for (const item of this.selectedItems()) {
      this.loadApplicableDiscounts(item);
    }
  }

  nextToConsulting() {
    if (this.selectedItems().length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No products',
        detail: 'Add at least one product or package',
      });
      return;
    }
    this.ensureDefaultBranch();
    this.saleMode.set('consulting');
    this.followUpDate.set(this.documentDate());
    this.step.set('consulting');
  }

  submitSale() {
    if (this.saleMode() === 'consulting') {
      this.submitConsulting();
      return;
    }
    const zeroItem = this.selectedItems().find((item) => item.allocation <= 0);
    if (zeroItem) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid amount',
        detail: `Enter an amount greater than zero for ${zeroItem.product.name}`,
      });
      return;
    }
    if (this.totalPaid() <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No payment',
        detail: 'Enter an amount received',
      });
      return;
    }
    if (this.receiptNumber) {
      this.paymentService.checkReceipt(this.receiptNumber).subscribe({
        next: (res) => {
          if (res.exists) {
            this.messageService.add({
              severity: 'error',
              summary: 'Receipt already used',
              detail: this.receiptNumber,
            });
            return;
          }
          this.doSubmit();
        },
        error: () => this.doSubmit(),
      });
      return;
    }
    this.doSubmit();
  }

  private submitConsulting() {
    if (this.isNewSale()) {
      this.submitNewSale();
    } else {
      this.submitUpsell();
    }
  }

  private doSubmit() {
    if (this.isNewSale()) {
      this.submitNewSale();
    } else {
      this.submitUpsell();
    }
  }

  private submitNewSale() {
    if (this.submitting()) return;
    if (!this.branchId() || !this.branches().some((b) => b.id === this.branchId())) {
      this.submitting.set(false);
      this.messageService.add({
        severity: 'warn',
        summary: 'Branch required',
        detail: 'Please select a collecting branch before submitting.',
      });
      return;
    }
    this.submitting.set(true);
    const consulting = this.saleMode() === 'consulting';
    const items: FullConsultationItem[] = this.selectedItems().map((item) => ({
      product_id: item.product.id,
      package_id: item.package?.id,
      allocation: consulting ? 0 : item.allocation,
      installments: consulting ? [] : item.installments,
      discount_id: !consulting && item.selectedDiscount ? item.selectedDiscount.id : undefined,
    }));
    const payload = {
      phone: this.phone.trim(),
      first_name: this.firstName.trim(),
      middle_name: this.middleName.trim() || undefined,
      last_name: this.lastName.trim() || undefined,
      location: this.location.trim() || undefined,
      how_they_knew_us: this.howTheyKnewUs.trim() || undefined,
      document_date: this.documentDate(),
      branch_id: this.branchId(),
      items,
      payment: !consulting ? { receipt_number: this.receiptNumber || undefined } : undefined,
      follow_up: consulting
        ? {
            follow_up_date: this.followUpDate(),
            note: this.followUpNote.trim() || undefined,
            type: 'conversion' as const,
          }
        : undefined,
      converter_id: this.converterId() || undefined,
      primary_recommender_id: this.primaryRecommenderId() || undefined,
      secondary_recommender_id: this.secondaryRecommenderId() || undefined,
    };
    this.consultationService.createFull(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.resultConsultationId.set(res.id);
        this.step.set('done');
      },
      error: (err) => {
        this.submitting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: consulting ? 'Consultation failed' : 'Sale failed',
          detail: err.error?.detail || 'Could not complete the action',
        });
      },
    });
  }

  private async submitUpsell() {
    if (this.submitting()) return;
    const consultation = this.existingConsultation();
    if (!consultation) return;
    if (this.selectedItems().length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No products',
        detail: 'Add at least one product or package before continuing',
      });
      return;
    }
    this.submitting.set(true);
    const docDate = this.documentDate();
    const consulting = this.saleMode() === 'consulting';
    try {
      if (consulting) {
        const itemIds: string[] = [];
        for (const item of this.selectedItems()) {
          if (item.cartItemId) {
            itemIds.push(item.cartItemId);
            continue;
          }
          const cartItem = await lastValueFrom(
            this.consultationService.addCartItem(consultation.id, {
              product_id: item.product.id,
              package_id: item.package?.id,
              converter_id: this.converterId() || undefined,
              primary_recommender_id: this.primaryRecommenderId() || undefined,
              secondary_recommender_id: this.secondaryRecommenderId() || undefined,
            }),
          );
          await lastValueFrom(
            this.consultationService.updateCartItem(cartItem.id, { status: 'consulting' }),
          );
          itemIds.push(cartItem.id);
        }
        await lastValueFrom(
          this.consultationService.createFollowUp(consultation.id, {
            follow_up_date: this.followUpDate(),
            note: this.followUpNote.trim() || undefined,
            type: 'conversion',
            cart_item_ids: itemIds,
          }),
        );
        this.resultConsultationId.set(consultation.id);
        this.submitting.set(false);
        this.step.set('done');
        return;
      }
      for (const item of this.selectedItems()) {
        let cartItemId: string;
        if (item.cartItemId) {
          cartItemId = item.cartItemId;
        } else {
          const cartItem = await lastValueFrom(
            this.consultationService.addCartItem(consultation.id, {
              product_id: item.product.id,
              package_id: item.package?.id,
            }),
          );
          cartItemId = cartItem.id;
        }
        if (this.hasPriorPayments(item)) {
          // Subsequent payment on an existing schedule: collect against the
          // earliest pending installment and push the remainder forward to the
          // chosen date (no duplicate schedule is created). Discounts do not
          // apply to collection payments.
          const pendings = this.existingPaymentsForSaleItem(item)
            .flatMap((p) => p.installments ?? [])
            .filter((inst) => inst.status !== 'paid')
            .sort(
              (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
            );
          if (pendings.length && item.allocation > 0) {
            const first = pendings[0];
            await lastValueFrom(
              this.paymentService.updateInstallment(first.payment_id, first.id, {
                paid_date: docDate,
                paid_amount: item.allocation,
                push_forward_date: item.installments[0]?.due_date,
                notes: 'Balance collected on mobile',
              }),
            );
          } else {
            const payment = await lastValueFrom(
              this.paymentService.createPayment(consultation.id, {
                product_id: item.product.id,
                package_id: item.package?.id,
                total_amount: item.allocation,
                notes: `Upsell payment of ${item.allocation}`,
                receipt_number: this.receiptNumber || undefined,
                installments: [{ due_date: docDate, amount: item.allocation }],
                document_date: docDate,
                branch_id: this.branchId() || undefined,
              }),
            );
            const inst = payment.installments?.[0];
            if (inst && item.allocation > 0) {
              await lastValueFrom(
                this.paymentService.updateInstallment(payment.id, inst.id, {
                  paid_date: docDate,
                  paid_amount: item.allocation,
                  notes: 'Upsell collected on mobile',
                }),
              );
            }
          }
          const balanceAfter = Math.max(
            0,
            this.existingBalanceForSaleItem(item) - item.allocation,
          );
          const status = balanceAfter <= 0 ? 'converted_paid' : 'converted_paying';
          await lastValueFrom(this.consultationService.updateCartItem(cartItemId, { status }));
          continue;
        }

        // First payment path: apply selected discount before creating payment
        if (item.selectedDiscount) {
          await lastValueFrom(
            this.discountService.apply(item.selectedDiscount.id, cartItemId)
          );
        }

        const discountedPrice = this.discountedPrice(item);
        const payment = await lastValueFrom(
          this.paymentService.createPayment(consultation.id, {
            product_id: item.product.id,
            package_id: item.package?.id,
            total_amount: discountedPrice,
            notes: `Upsell payment of ${item.allocation}${item.selectedDiscount ? `, Discount: ${item.selectedDiscount.code}` : ''}`,
            receipt_number: this.receiptNumber || undefined,
            installments: [{ due_date: docDate, amount: item.allocation }, ...item.installments],
            document_date: docDate,
            branch_id: this.branchId() || undefined,
          }),
        );
        const inst = payment.installments?.[0];
        if (inst && item.allocation > 0) {
          await lastValueFrom(
            this.paymentService.updateInstallment(payment.id, inst.id, {
              paid_date: docDate,
              paid_amount: item.allocation,
              notes: 'Upsell collected on mobile',
            }),
          );
        }
        const status = item.allocation >= discountedPrice ? 'converted_paid' : 'converted_paying';
        await lastValueFrom(this.consultationService.updateCartItem(cartItemId, { status }));
      }
      this.resultConsultationId.set(consultation.id);
      this.submitting.set(false);
      this.step.set('done');
    } catch (err: any) {
      this.submitting.set(false);
      this.messageService.add({
        severity: 'error',
        summary: 'Upsell failed',
        detail: err.error?.detail || 'Could not complete the upsell',
      });
    }
  }

  openReceipt() {
    const id = this.resultConsultationId();
    if (!id) return;
    this.loading.set(true);
    this.paymentService.getPaymentsByConsultation(id).subscribe({
      next: (payments) => {
        const payment = payments[0];
        if (!payment) {
          this.loading.set(false);
          this.messageService.add({ severity: 'info', summary: 'No payments' });
          return;
        }
        this.paymentService.downloadReceipt(payment.id).subscribe({
          next: (blob) => {
            this.loading.set(false);
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
          },
          error: () => {
            this.loading.set(false);
            this.messageService.add({ severity: 'error', summary: 'Could not load receipt' });
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Could not load receipt' });
      },
    });
  }

  resetSale() {
    this.step.set('home');
    this.isPrevious.set(false);
    this.resetFlow();
    this.documentDate.set(todayISO());
    this.loadActiveClients();
    this.loadConsultations();
  }

  itemSubtotal(item: SaleItem) {
    return item.price || item.allocation;
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }
}
