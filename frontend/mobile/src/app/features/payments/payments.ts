import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
  Consultation,
  CartItem,
  ClientSummary,
} from '../../core/services/consultation.service';
import {
  PaymentService,
  PaymentRead,
  BranchInfo,
  InstallmentRead,
} from '../../core/services/payment.service';
import { ClientSearch } from '../../shared/client-search/client-search';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { addDays, formatMoney, toISODate, todayISO } from '../../shared/format';
import { CatalogService } from '../../core/services/catalog.service';

type Step = 'search' | 'overview' | 'collect' | 'result';

interface CollectScheduleRow {
  installment_id: string | null;
  payment_id: string | null;
  amount: number;
  due_date: string | null;
  original_due_date: string | null;
  original_amount: number | null;
}

@Component({
  selector: 'app-payments',
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    DatePickerModule,
    SelectModule,
    ClientSearch,
    LoadingOverlay,
    PageHeader,
  ],
  templateUrl: './payments.html',
})
export class Payments {
  private auth = inject(AuthService);
  private consultationService = inject(ConsultationService);
  private paymentService = inject(PaymentService);
  private catalogService = inject(CatalogService);
  private messageService = inject(MessageService);
  private route = inject(ActivatedRoute);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;

  constructor() {
    this.loadOutstanding(true);
    this.route.queryParams.subscribe((qp) => {
      const consultationId = qp['consultationId'];
      if (consultationId && this.step() === 'search') {
        this.loadConsultation(consultationId, qp['cartItemId']);
        return;
      }
      const phone = qp['phone'];
      if (phone && !this.client && this.step() === 'search') {
        this.consultationService.clientSearch(phone).subscribe({
          next: (matches) => {
            if (matches && matches.length > 0) {
              this.client = matches[0];
              this.loadOverview();
            }
          },
          error: () => {},
        });
      }
    });
  }

  step = signal<Step>('search');
  loading = signal(false);
  submitting = signal(false);

  client: ClientInfo | null = null;
  consultation = signal<Consultation | null>(null);
  private consultationId = '';
  payments = signal<PaymentRead[]>([]);
  branches = signal<BranchInfo[]>([]);

  // outstanding-balance clients list (search step)
  outstandingClients = signal<ClientSummary[]>([]);
  outstandingTotal = signal(0);
  outstandingPage = signal(1);
  outstandingLoading = signal(false);
  outstandingQuery = signal('');
  outstandingHasMore = computed(
    () => this.outstandingClients().length < this.outstandingTotal(),
  );
  private outstandingQueryDebounce: ReturnType<typeof setTimeout> | null = null;
  private outstandingRequestInFlight = false;

  // collect dialog
  targetItem = signal<CartItem | null>(null);
  collectAmount = signal(0);
  receiptNumber = '';
  branchId = signal<string | null>(null);
  documentDate = signal<string>(todayISO());
  documentDateObject = computed(() =>
    this.documentDate() ? new Date(this.documentDate() + 'T00:00:00') : null,
  );
  get today(): Date {
    return new Date();
  }
  // editable schedule of the item's existing pending installments
  collectSchedule = signal<CollectScheduleRow[]>([]);
  // product price for consulting items (fetched when the collect dialog opens)
  consultingPrice = signal(0);

  // balance still owed after this payment — used to build/adjust the schedule
  remainingAfterCollect = computed(() => {
    const ci = this.targetItem();
    if (!ci) return 0;
    const paid = this.collectAmount() || 0;
    const base = this.isConsulting(ci) ? this.consultingPrice() : this.balanceForItem(ci);
    return Math.max(0, Math.round((base - paid) * 100) / 100);
  });

  // result
  resultSuccess = signal<boolean | null>(null);
  resultPaymentId = signal<string | null>(null);
  resultAmount = signal(0);
  resultMessage = signal('');

  selectedClient(client: ClientInfo) {
    this.client = client;
    this.loadOverview();
  }

  onOutstandingQuery(query: string) {
    this.outstandingQuery.set(query);
    if (this.outstandingQueryDebounce) clearTimeout(this.outstandingQueryDebounce);
    this.outstandingQueryDebounce = setTimeout(() => this.loadOutstanding(true), 350);
  }

  onOutstandingScroll(event: Event) {
    const el = event.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      this.loadOutstanding(false);
    }
  }

  loadOutstanding(reset: boolean) {
    if (this.outstandingRequestInFlight) return;
    if (!reset && !this.outstandingHasMore()) return;
    const page = reset ? 1 : this.outstandingPage() + 1;
    this.outstandingRequestInFlight = true;
    this.outstandingLoading.set(true);
    const q = this.outstandingQuery().trim();
    this.consultationService
      .listClients({
        search: q || undefined,
        page,
        page_size: 20,
        outstanding_only: true,
      })
      .subscribe({
        next: (res) => {
          this.outstandingRequestInFlight = false;
          this.outstandingLoading.set(false);
          this.outstandingPage.set(page);
          this.outstandingTotal.set(res.total ?? 0);
          const clients = res.clients ?? [];
          this.outstandingClients.update((prev) =>
            reset ? clients : [...prev, ...clients],
          );
        },
        error: () => {
          this.outstandingRequestInFlight = false;
          this.outstandingLoading.set(false);
        },
      });
  }

  outstandingBalanceFor(client: ClientSummary): number {
    return (client.products ?? []).reduce(
      (sum, p) => sum + parseFloat(p.balance || '0'),
      0,
    );
  }

  outstandingItemsCount(client: ClientSummary): number {
    return (client.products ?? []).filter((p) => parseFloat(p.balance || '0') > 0).length;
  }

  lastPaymentLabel(client: ClientSummary): string {
    if (!client.last_payment_date) return '';
    const d = new Date(client.last_payment_date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  activeForLabel(client: ClientSummary): string {
    const days = client.active_for_days ?? 0;
    if (days <= 0) return '';
    if (days < 30) return `Active ${days}d`;
    const months = Math.floor(days / 30);
    const rem = days % 30;
    if (months === 1) return rem > 0 ? `Active 1m ${rem}d` : 'Active 1m';
    return rem > 0 ? `Active ${months}m ${rem}d` : `Active ${months}m`;
  }

  openOutstandingClient(client: ClientSummary) {
    this.client = {
      phone: client.phone,
      first_name: client.first_name,
      middle_name: client.middle_name,
      last_name: client.last_name,
      location: client.location,
      how_they_knew_us: null,
      interest_level: client.interest_level,
      latest_status: null,
      latest_consultation_id: client.id,
    };
    this.loadOverview();
  }

  loadOverview() {
    const client = this.client;
    if (!client || !client.latest_consultation_id) return;
    this.loadConsultation(client.latest_consultation_id);
  }

  private loadConsultation(id: string, targetCartItemId?: string) {
    this.loading.set(true);
    this.consultationService.get(id).subscribe({
      next: (consultation) => {
        this.consultation.set(consultation);
        this.consultationId = consultation.id;
        this.loadPayments(consultation.id, targetCartItemId);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not load client',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  private loadPayments(consultationId: string, targetCartItemId?: string) {
    this.paymentService.getPaymentsByConsultation(consultationId).subscribe({
      next: (payments) => {
        this.payments.set(payments ?? []);
        this.loading.set(false);
        this.step.set('overview');
        if (this.branches().length === 0) this.loadBranches();
        if (targetCartItemId) {
          const ci = (this.consultation()?.cart_items ?? []).find(
            (c) => c.id === targetCartItemId,
          );
          if (ci) this.openCollect(ci);
        }
      },
      error: () => {
        this.loading.set(false);
        this.payments.set([]);
        this.step.set('overview');
      },
    });
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        this.catalogService.getCurrentUser().subscribe({
          next: (me) => {
            const assigned = (me.branch_ids ?? []).map(String);
            const match = assigned.find((id) => branches.some((b) => b.id === id));
            if (match) this.branchId.set(match);
            else if (branches.length === 1) this.branchId.set(branches[0].id);
          },
          error: () => {
            if (branches.length === 1) this.branchId.set(branches[0].id);
          },
        });
      },
      error: () => {},
    });
  }

  clientName() {
    const c = this.consultation();
    if (!c) return this.client?.first_name || '';
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || c.first_name;
  }

  payableItems(): CartItem[] {
    const items = this.consultation()?.cart_items || [];
    return items.filter(
      (ci) =>
        ci.status === 'converted_paid' ||
        ci.status === 'converted_paying' ||
        ci.status === 'consulting',
    );
  }

  isConsulting(ci: CartItem): boolean {
    return ci.status === 'consulting';
  }

  paymentsForItem(ci: CartItem): PaymentRead[] {
    return this.payments().filter(
      (p) =>
        p.product_id === ci.product_id &&
        (ci.package_id ? p.package_id === ci.package_id : !p.package_id),
    );
  }

  totalForItem(ci: CartItem): number {
    const pays = this.paymentsForItem(ci);
    if (!pays.length) return 0;
    const sorted = [...pays].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return parseFloat(sorted[0].total_amount);
  }

  paidForItem(ci: CartItem): number {
    const pays = this.paymentsForItem(ci);
    return pays.reduce((s, p) => s + parseFloat(p.total_paid || '0'), 0);
  }

  balanceForItem(ci: CartItem): number {
    return Math.max(0, this.totalForItem(ci) - this.paidForItem(ci));
  }

  itemLabel(ci: CartItem): string {
    return ci.package_name || ci.product_name || 'Product';
  }

  openCollect(ci: CartItem) {
    this.targetItem.set(ci);
    this.collectAmount.set(0);
    this.receiptNumber = '';
    this.documentDate.set(todayISO());
    if (this.branches().length > 0 && !this.branchId()) {
      this.branchId.set(this.branches()[0].id);
    }
    this.collectSchedule.set(
      this.scheduledForItem(ci)
        .slice()
        .sort(
          (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
        )
        .map((inst) => ({
          installment_id: inst.id,
          payment_id: inst.payment_id,
          amount: parseFloat(inst.amount),
          due_date: inst.due_date,
          original_due_date: inst.due_date,
          original_amount: parseFloat(inst.amount),
        })),
    );
    if (this.isConsulting(ci)) {
      this.consultingPrice.set(0);
      this.catalogService.getProduct(ci.product_id).subscribe({
        next: (product) => {
          const pkg = ci.package_id
            ? product.packages?.find((p) => p.id === ci.package_id)
            : product.packages && product.packages.length === 1
              ? product.packages[0]
              : undefined;
          this.consultingPrice.set(pkg ? parseFloat(pkg.price) || 0 : 0);
        },
        error: () => this.consultingPrice.set(0),
      });
    } else {
      this.consultingPrice.set(0);
    }
    this.step.set('collect');
  }

  scheduledForItem(ci: CartItem): InstallmentRead[] {
    const pays = this.paymentsForItem(ci);
    return pays
      .flatMap((p) => p.installments)
      .filter((inst) => inst.status === 'pending');
  }

  setScheduleDate(index: number, date: Date | null) {
    this.collectSchedule.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, due_date: date ? toISODate(date) : null } : r)),
    );
  }

  clearScheduleDate(index: number) {
    this.collectSchedule.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, due_date: null } : r)),
    );
  }

  calculateSchedule() {
    const ci = this.targetItem();
    if (!ci) return;
    const remaining = this.remainingAfterCollect();
    const rows = this.collectSchedule();
    const existing = rows.some((r) => r.installment_id && r.payment_id);
    if (!existing) {
      if (remaining <= 0) {
        this.collectSchedule.set([]);
        return;
      }
      const base = new Date(this.documentDate() + 'T00:00:00');
      const half = Math.round((remaining / 2) * 100) / 100;
      this.collectSchedule.set([
        {
          installment_id: null,
          payment_id: null,
          amount: half,
          due_date: toISODate(addDays(base, 7)),
          original_due_date: null,
          original_amount: null,
        },
        {
          installment_id: null,
          payment_id: null,
          amount: Math.round((remaining - half) * 100) / 100,
          due_date: toISODate(addDays(base, 14)),
          original_due_date: null,
          original_amount: null,
        },
      ]);
      return;
    }
    // Existing DB schedule: preview how the received amount pays it down. Always
    // recompute from the original amounts so pressing Calculate repeatedly never
    // keeps shrinking the schedule to a lower total.
    let paidLeft = Math.max(0, this.collectAmount() || 0);
    this.collectSchedule.update((items) =>
      items.map((r) => {
        const orig = r.original_amount ?? r.amount;
        const take = Math.min(orig, paidLeft);
        paidLeft -= take;
        return {
          ...r,
          amount: Math.max(0, Math.round((orig - take) * 100) / 100),
          original_amount: orig,
        };
      }),
    );
  }

  onDocumentDate(date: Date | null) {
    if (date) this.documentDate.set(toISODate(date));
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

  collectPayment() {
    const ci = this.targetItem();
    const consultation = this.consultation();
    const amount = this.collectAmount();
    if (!ci || !consultation) return;
    if (!amount || amount <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Enter an amount' });
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
          this.doSubmit(consultation.id, ci, amount);
        },
        error: () => this.doSubmit(consultation.id, ci, amount),
      });
      return;
    }
    this.doSubmit(consultation.id, ci, amount);
  }

  private doSubmit(consultationId: string, ci: CartItem, amount: number) {
    // Every collection is recorded as its OWN independent Payment row (own
    // receipt/transaction id) instead of accumulating onto the original
    // schedule Payment record.
    const rows = this.collectSchedule();
    const scheduleAdjustments = rows
      .filter(
        (r) =>
          r.installment_id &&
          r.due_date &&
          r.due_date !== r.original_due_date,
      )
      .map((r) => ({
        installment_id: r.installment_id!,
        due_date: r.due_date!,
      }));
    const futureSchedule = rows
      .filter((r) => !r.installment_id && r.due_date && r.amount > 0)
      .map((r) => ({ due_date: r.due_date!, amount: r.amount }));
    const docDate = this.documentDate();
    this.submitting.set(true);
    this.paymentService
      .collectPayment(consultationId, {
        product_id: ci.product_id,
        package_id: ci.package_id || undefined,
        branch_id: this.branchId() || undefined,
        amount,
        document_date: docDate,
        receipt_number: this.receiptNumber || undefined,
        notes: 'Payment collected on mobile',
        schedule_adjustments: scheduleAdjustments.length
          ? scheduleAdjustments
          : undefined,
        future_schedule: futureSchedule.length ? futureSchedule : undefined,
      })
      .subscribe({
        next: (payment) => {
          this.submitting.set(false);
          this.finishCollect(consultationId, ci, payment.id);
        },
        error: (err) => {
          this.submitting.set(false);
          this.resultSuccess.set(false);
          this.resultPaymentId.set(null);
          this.resultAmount.set(amount);
          this.resultMessage.set(
            err.error?.detail || 'Could not record the payment.',
          );
          this.step.set('result');
        },
      });
  }

  private finishCollect(consultationId: string, ci: CartItem, paymentId: string) {
    this.paymentService.getPaymentsByConsultation(consultationId).subscribe({
      next: (payments) => {
        this.payments.set(payments ?? []);
        const balance = this.balanceForItem(ci);
        if (['converted_paid', 'converted_paying'].includes(ci.status) && balance <= 0) {
          this.consultationService.updateCartItem(ci.id, { status: 'converted_paid' }).subscribe({
            next: () => this.showResult(true, paymentId, balance),
            error: () => this.showResult(true, paymentId, balance),
          });
          return;
        }
        if (!['converted_paid', 'converted_paying', 'lost'].includes(ci.status)) {
          const nextStatus = balance <= 0 ? 'converted_paid' : 'converted_paying';
          this.consultationService.updateCartItem(ci.id, { status: nextStatus }).subscribe({
            next: () => this.showResult(true, paymentId, balance),
            error: () => this.showResult(true, paymentId, balance),
          });
          return;
        }
        this.showResult(true, paymentId, balance);
      },
      error: () => this.showResult(true, paymentId, this.balanceForItem(ci)),
    });
  }

  private showResult(success: boolean, paymentId: string, balance: number) {
    this.resultSuccess.set(success);
    this.resultPaymentId.set(paymentId);
    this.resultAmount.set(this.collectAmount());
    this.resultMessage.set(
      success
        ? balance <= 0
          ? 'Payment received. Item fully paid.'
          : `Payment received. Remaining balance: ${this.money(balance)}`
        : 'Something went wrong. Please check the client profile.',
    );
    this.step.set('result');
  }

  printReceipt() {
    const id = this.resultPaymentId();
    if (!id) return;
    this.loading.set(true);
    this.paymentService.downloadReceipt(id, this.resultAmount()).subscribe({
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
  }

  returnToOverview() {
    this.reload();
  }

  private reload() {
    if (!this.consultationId) return;
    this.loading.set(true);
    this.consultationService.get(this.consultationId).subscribe({
      next: (consultation) => {
        this.consultation.set(consultation);
        this.loadPayments(consultation.id);
      },
      error: () => {
        this.loading.set(false);
        this.step.set('search');
      },
    });
  }

  backToOverview() {
    this.step.set('overview');
  }

  backToSearch() {
    this.step.set('search');
    this.client = null;
    this.consultation.set(null);
    this.consultationId = '';
    this.payments.set([]);
    this.loadOutstanding(true);
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }

  dueLabel(inst: { due_date: string; status: string }): string {
    return inst.status === 'paid' ? 'Paid' : `Due ${inst.due_date}`;
  }
}
