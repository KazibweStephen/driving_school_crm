import { Component, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
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
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config';

interface SelectedProduct {
  product: Product;
  packageId: string | null;
  price: number;
  packageName: string;
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
  };

  selectedProduct = signal<Product | null>(null);
  selectedPackageId = signal<string | null>(null);
  selectedProducts = signal<SelectedProduct[]>([]);

  packageAllocations = signal<PackageAllocation[]>([]);
  paymentReceiptNumber = signal('');
  paymentInstallments = signal<{ due_date: Date | null; amount: number }[]>([]);

  // Receipt validation
  receiptChecking = signal(false);
  receiptAvailable = signal<boolean | null>(null);

  // Receipt data after payment
  receiptItems = signal<ReceiptItem[]>([]);
  receiptSystemNumber = signal('');
  receiptManualNumber = signal('');
  receiptTotalPaid = signal(0);
  receiptDate = signal('');
  receiptUserName = signal('');
  receiptInstallments = signal<{ due_date: string; amount: number; product_name: string }[]>([]);

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
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router,
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
    };
    this.selectedProduct.set(null);
    this.selectedPackageId.set(null);
    this.selectedProducts.set([]);
    this.convertNow.set(false);
    this.packageAllocations.set([]);
    this.paymentReceiptNumber.set('');
    this.paymentInstallments.set([]);
    this.createdConsultation.set(null);
    this.receiptChecking.set(false);
    this.receiptAvailable.set(null);
    this.receiptItems.set([]);
    this.receiptSystemNumber.set('');
    this.receiptManualNumber.set('');
    this.receiptTotalPaid.set(0);
    this.receiptDate.set('');
    this.receiptUserName.set('');
    this.receiptInstallments.set([]);
    this.createStep.set(1);
    this.showCreateDialog.set(true);
  }

  get selectedProductTotal(): number {
    return this.selectedProducts().reduce((sum, sp) => sum + sp.price, 0);
  }

  get totalAllocated(): number {
    return this.packageAllocations().reduce((sum, a) => sum + a.allocated, 0);
  }

  get unallocatedAmount(): number {
    return Math.max(0, this.selectedProductTotal - this.totalAllocated);
  }

  canCompletePayment(): boolean {
    if (this.totalAllocated <= 0) return false;
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
    const maxForPackage = sp.price;
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
        this.createStep.set(3);
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

    this.loading.set(true);
    try {
      // Build items with allocations and installments
      const items = this.selectedProducts().map((sp, i) => {
        const paidNow = this.getAllocation(i);
        const remaining = Math.max(0, sp.price - paidNow);
        // Distribute global installments proportionally across unpaid items
        const totalRemaining = this.unallocatedAmount;
        const insts = totalRemaining > 0 ? this.paymentInstallments().map(inst => ({
          due_date: inst.due_date ? inst.due_date.toISOString().split('T')[0] : '',
          amount: Math.round(inst.amount * (remaining / totalRemaining)),
        })) : [];
        return {
          product_id: sp.product.id,
          package_id: sp.packageId || undefined,
          allocation: paidNow,
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
      if (this.form.start_date) payload.start_date = this.form.start_date.toISOString().split('T')[0];
      if (this.form.notes) payload.notes = this.form.notes;
      payload.items = items;
      if (this.paymentReceiptNumber()) {
        payload.payment = { receipt_number: this.paymentReceiptNumber() };
      }

      const c = await this.consultationService.createFull(payload).toPromise();
      if (!c) throw new Error('Failed to create consultation');

      // Build receipt data
      const receiptData: ReceiptItem[] = [];
      let totalPaid = 0;
      for (let i = 0; i < this.selectedProducts().length; i++) {
        const sp = this.selectedProducts()[i];
        const allocation = this.getAllocation(i);
        const remaining = Math.max(0, sp.price - allocation);
        totalPaid += allocation;
        receiptData.push({
          productName: sp.product.name,
          packageName: sp.packageName,
          price: sp.price,
          paid: allocation,
          balance: remaining,
        });
      }

      // Get system receipt from the first payment
      let systemReceipt = '';
      if (c.cart_items && c.cart_items.length > 0) {
        const payments = await this.paymentService.getPaymentsByConsultation(c.id).toPromise();
        if (payments && payments.length > 0) {
          systemReceipt = payments[0].system_receipt_number;
        }
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
      this.receiptManualNumber.set(this.paymentReceiptNumber());
      this.receiptTotalPaid.set(totalPaid);
      this.receiptDate.set(new Date().toLocaleDateString());
      this.receiptUserName.set(this.authService.currentUser() || 'System');
      this.createdConsultation.set(c);
      this.createStep.set(4);
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
      if (this.form.start_date) payload.start_date = this.form.start_date.toISOString().split('T')[0];
      if (this.form.notes) payload.notes = this.form.notes;
      const c = await this.consultationService.create(payload).toPromise();
      if (!c) throw new Error('Failed to create consultation');

      if (!this.convertNow()) {
        for (const sp of this.selectedProducts()) {
          await this.cartItemService.create(c.id, {
            product_id: sp.product.id,
            package_id: sp.packageId || undefined,
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

  closeReceipt() {
    const c = this.createdConsultation();
    this.showCreateDialog.set(false);
    if (c) {
      this.search.set(this.form.phone);
      this.onSearch();
      this.router.navigate(['/consultations', c.id]);
    }
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
}
