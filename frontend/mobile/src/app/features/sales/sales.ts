import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { lastValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
  Consultation,
  CartItem,
  FullConsultationItem,
} from '../../core/services/consultation.service';
import { CatalogService, Product, Package, User } from '../../core/services/catalog.service';
import { PaymentService, BranchInfo, PaymentRead } from '../../core/services/payment.service';
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
}

type Step = 'home' | 'client' | 'products' | 'payment' | 'done';
type SaleMode = 'sale' | 'consulting';

@Component({
  selector: 'app-sales',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
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
  private messageService = inject(MessageService);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;
  Math = Math;

  parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    return new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  }

  step = signal<Step>('home');
  isPrevious = signal(false);
  loading = signal(false);
  submitting = signal(false);

  products = signal<Product[]>([]);
  productsLoaded = false;
  colleagues = signal<User[]>([]);

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

  totalPrice = computed(() => this.selectedItems().reduce((s, i) => s + i.price, 0));
  totalPaid = computed(() => this.selectedItems().reduce((s, i) => s + i.allocation, 0));
  totalRemaining = computed(() => this.totalPrice() - this.totalPaid());

  startFlow(newSale: boolean, previous: boolean) {
    this.isNewSale.set(newSale);
    this.isPrevious.set(previous);
    this.resetFlow();
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
    this.followUpDate.set(todayISO());
    this.followUpNote = '';
    this.converterId.set(null);
    this.primaryRecommenderId.set(null);
    this.secondaryRecommenderId.set(null);
  }

  setSaleMode(mode: SaleMode) {
    this.saleMode.set(mode);
    if (mode === 'consulting') {
      this.followUpDate.set(this.documentDate());
    }
  }

  onFollowUpDate(date: Date | null) {
    if (date) this.followUpDate.set(toISODate(date));
  }

  private loadProducts() {
    this.catalogService
      .listProducts({ status: 'active', page_size: 100 })
      .subscribe({
        next: (res) => {
          const active = (res.products ?? []).filter((p) => p.status === 'active');
          this.products.set(active);
          this.productsLoaded = true;
        },
        error: () => {
          this.products.set([]);
          this.productsLoaded = true;
        },
      });
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        if (branches.length === 1) this.branchId.set(branches[0].id);
      },
      error: () => {
        this.catalogService.listMyBranches().subscribe((branches) => {
          this.branches.set(branches);
          if (branches.length === 1) this.branchId.set(branches[0].id);
        });
      },
    });
  }

  private loadColleagues() {
    this.catalogService.listUsers({ page_size: 100 }).subscribe({
      next: (res) => {
        this.colleagues.set((res.users ?? []).filter((u) => u.status === 'active'));
      },
      error: () => this.colleagues.set([]),
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
    return this.existingItems().some(
      (ci) =>
        ci.product_id === product.id &&
        (pkg ? ci.package_id === pkg.id : !ci.package_id),
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

  addPackage(product: Product, pkg: Package) {
    if (this.selectedItems().some((i) => i.package?.id === pkg.id)) {
      this.messageService.add({ severity: 'info', summary: 'Already added', detail: pkg.name });
      return;
    }
    if (this.isPurchased(product, pkg)) {
      this.messageService.add({ severity: 'info', summary: 'Already purchased', detail: pkg.name });
      return;
    }
    const price = Number(pkg.price);
    this.selectedItems.update((items) => [
      ...items,
      { product, package: pkg, price, allocation: price, installments: [] },
    ]);
  }

  addProductOnly(product: Product) {
    if (this.selectedItems().some((i) => i.product.id === product.id && !i.package)) {
      this.messageService.add({ severity: 'info', summary: 'Already added', detail: product.name });
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

  onAllocationChange(item: SaleItem) {
    const base = toISODate(new Date(this.documentDate() + 'T00:00:00'));
    const remaining = Math.max(0, item.price - item.allocation);
    let installments: { amount: number; due_date: string }[] = [];
    if (remaining > 0) {
      const half = Math.round((remaining / 2) * 100) / 100;
      installments = [
        { amount: half, due_date: toISODate(addDays(new Date(base), 7)) },
        { amount: Math.round((remaining - half) * 100) / 100, due_date: toISODate(addDays(new Date(base), 14)) },
      ];
    }
    this.selectedItems.update((items) =>
      items.map((i) =>
        i === item
          ? { ...i, installments }
          : i,
      ),
    );
  }

  setInstallmentAmount(item: SaleItem, index: number, amount: number | null) {
    if (!item.installments[index]) return;
    const value = amount ?? 0;
    this.selectedItems.update((items) =>
      items.map((i) =>
        i === item
          ? {
              ...i,
              installments: i.installments.map((inst, idx) =>
                idx === index ? { ...inst, amount: value } : inst,
              ),
            }
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
    this.step.set('payment');
  }

  submitSale() {
    if (this.saleMode() === 'consulting') {
      this.submitConsulting();
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
    this.submitting.set(true);
    const consulting = this.saleMode() === 'consulting';
    const items: FullConsultationItem[] = this.selectedItems().map((item) => ({
      product_id: item.product.id,
      package_id: item.package?.id,
      allocation: consulting ? 0 : item.allocation,
      installments: consulting ? [] : item.installments,
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
      payment: !consulting && this.receiptNumber ? { receipt_number: this.receiptNumber } : undefined,
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
    const consultation = this.existingConsultation();
    if (!consultation) return;
    this.submitting.set(true);
    const docDate = this.documentDate();
    const consulting = this.saleMode() === 'consulting';
    try {
      if (consulting) {
        const itemIds: string[] = [];
        for (const item of this.selectedItems()) {
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
        const cartItem = await lastValueFrom(
          this.consultationService.addCartItem(consultation.id, {
            product_id: item.product.id,
            package_id: item.package?.id,
          }),
        );
        const payment = await lastValueFrom(
          this.paymentService.createPayment(consultation.id, {
            product_id: item.product.id,
            package_id: item.package?.id,
            total_amount: item.price,
            notes: `Upsell payment of ${item.price}`,
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
        const status = item.allocation >= item.price ? 'converted_paid' : 'converted_paying';
        await lastValueFrom(this.consultationService.updateCartItem(cartItem.id, { status }));
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
  }

  itemSubtotal(item: SaleItem) {
    return item.price || item.allocation;
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }
}
