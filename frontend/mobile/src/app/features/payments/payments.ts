import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  ClientInfo,
  Consultation,
  CartItem,
} from '../../core/services/consultation.service';
import {
  PaymentService,
  PaymentRead,
  BranchInfo,
} from '../../core/services/payment.service';
import { ClientSearch } from '../../shared/client-search/client-search';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney, toISODate, todayISO } from '../../shared/format';

type Step = 'search' | 'overview' | 'collect' | 'result';

@Component({
  selector: 'app-payments',
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
  templateUrl: './payments.html',
})
export class Payments {
  private auth = inject(AuthService);
  private consultationService = inject(ConsultationService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);

  currency = this.auth.currencyCode;
  canBackdate = this.auth.currentUserCanBackdate;

  step = signal<Step>('search');
  loading = signal(false);
  submitting = signal(false);

  client: ClientInfo | null = null;
  consultation = signal<Consultation | null>(null);
  private consultationId = '';
  payments = signal<PaymentRead[]>([]);
  branches = signal<BranchInfo[]>([]);

  // collect dialog
  targetItem = signal<CartItem | null>(null);
  collectAmount = signal(0);
  receiptNumber = '';
  branchId = signal<string | null>(null);
  documentDate = signal<string>(todayISO());
  documentDateObject = computed(() =>
    this.documentDate() ? new Date(this.documentDate() + 'T00:00:00') : null,
  );

  // result
  resultSuccess = signal<boolean | null>(null);
  resultPaymentId = signal<string | null>(null);
  resultAmount = signal(0);
  resultMessage = signal('');

  selectedClient(client: ClientInfo) {
    this.client = client;
    this.loadOverview();
  }

  loadOverview() {
    const client = this.client;
    if (!client || !client.latest_consultation_id) return;
    this.loading.set(true);
    this.consultationService.get(client.latest_consultation_id).subscribe({
      next: (consultation) => {
        this.consultation.set(consultation);
        this.consultationId = consultation.id;
        this.loadPayments(consultation.id);
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

  private loadPayments(consultationId: string) {
    this.paymentService.getPaymentsByConsultation(consultationId).subscribe({
      next: (payments) => {
        this.payments.set(payments ?? []);
        this.loading.set(false);
        this.step.set('overview');
        if (this.branches().length === 0) this.loadBranches();
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
        if (branches.length === 1) this.branchId.set(branches[0].id);
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
    this.collectAmount.set(this.balanceForItem(ci));
    this.receiptNumber = '';
    this.documentDate.set(todayISO());
    if (this.branches().length === 1) {
      this.branchId.set(this.branches()[0].id);
    } else if (this.consultation()?.branch_id && !this.branchId()) {
      this.branchId.set(this.consultation()!.branch_id);
    }
    this.step.set('collect');
  }

  onDocumentDate(date: Date | null) {
    if (date) this.documentDate.set(toISODate(date));
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
          this.doCollect(consultation.id, ci, amount);
        },
        error: () => this.doCollect(consultation.id, ci, amount),
      });
      return;
    }
    this.doCollect(consultation.id, ci, amount);
  }

  private doCollect(consultationId: string, ci: CartItem, amount: number) {
    const docDate = this.documentDate();
    this.submitting.set(true);
    this.paymentService
      .createPayment(consultationId, {
        product_id: ci.product_id,
        package_id: ci.package_id || undefined,
        total_amount: amount,
        notes: `Collected on mobile: ${amount}`,
        receipt_number: this.receiptNumber || undefined,
        installments: [{ due_date: docDate, amount }],
        document_date: docDate,
        branch_id: this.branchId() || undefined,
      })
      .subscribe({
        next: (payment) => {
          const inst = payment.installments?.[0];
          if (!inst) {
            this.submitting.set(false);
            this.finishCollect(consultationId, ci, payment.id);
            return;
          }
          this.paymentService
            .updateInstallment(payment.id, inst.id, {
              paid_date: docDate,
              paid_amount: amount,
              notes: 'Collected on mobile',
            })
            .subscribe({
              next: () => {
                this.submitting.set(false);
                this.finishCollect(consultationId, ci, payment.id);
              },
              error: (err) => {
                this.submitting.set(false);
                this.resultSuccess.set(false);
                this.resultPaymentId.set(payment.id);
                this.resultAmount.set(amount);
                this.resultMessage.set(
                  err.error?.detail || 'Payment recorded but installment update failed.',
                );
                this.step.set('result');
              },
            });
        },
        error: (err) => {
          this.submitting.set(false);
          this.resultSuccess.set(false);
          this.resultPaymentId.set(null);
          this.resultAmount.set(amount);
          this.resultMessage.set(err.error?.detail || 'Could not record the payment.');
          this.step.set('result');
        },
      });
  }

  private finishCollect(consultationId: string, ci: CartItem, paymentId: string) {
    const balance = this.balanceForItem(ci);
    if (ci.status === 'consulting') {
      this.consultationService.updateCartItem(ci.id, { status: 'converted_paid' }).subscribe({
        next: () => this.showResult(true, paymentId, balance),
        error: () => this.showResult(true, paymentId, balance),
      });
    } else if (balance <= 0 && ci.status === 'converted_paying') {
      this.consultationService.updateCartItem(ci.id, { status: 'converted_paid' }).subscribe({
        next: () => this.showResult(true, paymentId, balance),
        error: () => this.showResult(true, paymentId, balance),
      });
    } else {
      this.showResult(true, paymentId, balance);
    }
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
    this.paymentService.downloadReceipt(id).subscribe({
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
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }

  dueLabel(inst: { due_date: string; status: string }): string {
    return inst.status === 'paid' ? 'Paid' : `Due ${inst.due_date}`;
  }
}
