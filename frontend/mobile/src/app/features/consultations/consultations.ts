import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import {
  ConsultationService,
  Consultation,
  CartItem,
} from '../../core/services/consultation.service';
import { PaymentService, PaymentRead } from '../../core/services/payment.service';
import { PermitService, PermitProgress } from '../../core/services/permit.service';
import { CatalogService, Product } from '../../core/services/catalog.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney, formatDate } from '../../shared/format';

@Component({
  selector: 'app-consultations',
  imports: [ButtonModule, LoadingOverlay, PageHeader],
  templateUrl: './consultations.html',
})
export class Consultations {
  private auth = inject(AuthService);
  private consultationService = inject(ConsultationService);
  private paymentService = inject(PaymentService);
  private permitService = inject(PermitService);
  private catalogService = inject(CatalogService);
  private messageService = inject(MessageService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  currency = this.auth.currencyCode;

  consultation = signal<Consultation | null>(null);
  payments = signal<PaymentRead[]>([]);
  products = signal<Product[]>([]);
  permitProgress = signal<Record<string, PermitProgress | null>>({});
  loading = signal(false);
  removing = signal(false);

  constructor() {
    this.loadProducts();
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  private loadProducts() {
    this.catalogService.listProducts({ status: 'active', page_size: 100 }).subscribe({
      next: (res) => this.products.set(res.products ?? []),
      error: () => this.products.set([]),
    });
  }

  load(id: string) {
    this.loading.set(true);
    this.permitProgress.set({});
    this.consultationService.get(id).subscribe({
      next: (consultation) => {
        this.consultation.set(consultation);
        this.loadPayments(id);
        this.loadPermits(consultation);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not load consultation',
          detail: err.error?.detail || 'Try again',
        });
      },
    });
  }

  private loadPayments(id: string) {
    this.paymentService.getPaymentsByConsultation(id).subscribe({
      next: (payments) => {
        this.payments.set(payments ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.payments.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadPermits(c: Consultation) {
    const items = (c.cart_items ?? []).filter((ci) => ci.requires_permit_processing);
    if (!items.length) return;
    for (const ci of items) {
      this.permitService.getPermitProgress(ci.id).subscribe({
        next: (pp) => this.permitProgress.update((m) => ({ ...m, [ci.id]: pp })),
        error: () => this.permitProgress.update((m) => ({ ...m, [ci.id]: null })),
      });
    }
  }

  requirePermit(ci: CartItem): boolean {
    return !!ci.requires_permit_processing;
  }

  permitForItem(ci: CartItem): PermitProgress | null | undefined {
    return this.permitProgress()[ci.id];
  }

  permitStatus(ci: CartItem, pp: PermitProgress | null | undefined): string {
    if (pp === undefined) return '';
    if (!pp) return 'not_qualified';
    if (pp.permit_received_date) return 'permit_received';
    if (pp.permit_paid) return 'permit_paid';
    if (pp.tested_on_date || pp.waiting_for_permit) return 'waiting_for_permit';
    if (pp.test_ready) return 'test_ready';
    if (!pp.got_learners_permit_date) {
      const total = this.totalForItem(ci);
      const ratio = total > 0 ? this.paidForItem(ci) / total : 0;
      return ratio >= 0.5 ? 'eligible' : 'not_qualified';
    }
    if (pp.learners_due_date && pp.learners_due_date <= new Date().toISOString().slice(0, 10)) {
      return 'due_for_testing';
    }
    return 'learners_active';
  }

  permitStatusLabel(status: string): string {
    const map: Record<string, string> = {
      not_qualified: 'Not Qualified',
      eligible: 'Eligible',
      learners_active: 'Learners Active',
      due_for_testing: 'Due For Testing',
      test_ready: 'Test Ready',
      waiting_for_permit: 'Waiting For Permit',
      permit_paid: 'Permit Paid',
      permit_received: 'Permit Received',
    };
    return map[status] ?? status;
  }

  permitStatusClass(status: string): string {
    const map: Record<string, string> = {
      not_qualified: 'bg-gray-100 text-gray-700',
      eligible: 'bg-blue-50 text-blue-700',
      learners_active: 'bg-green-50 text-green-700',
      due_for_testing: 'bg-amber-50 text-amber-700',
      test_ready: 'bg-purple-50 text-purple-700',
      waiting_for_permit: 'bg-orange-50 text-orange-700',
      permit_paid: 'bg-emerald-50 text-emerald-700',
      permit_received: 'bg-green-100 text-green-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  permitDate(d: string | null | undefined): string {
    return formatDate(d ?? undefined);
  }

  clientName(): string {
    const c = this.consultation();
    if (!c) return '';
    return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') || c.first_name;
  }

  itemLabel(ci: CartItem): string {
    if (ci.package_id) {
      for (const p of this.products()) {
        const pkg = p.packages.find((pk) => pk.id === ci.package_id);
        if (pkg) return pkg.name;
      }
    }
    const prod = this.products().find((p) => p.id === ci.product_id);
    if (prod) return prod.name;
    return 'Product';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      consulting: 'Consulting',
      converted: 'Converted',
      converted_paid: 'Paid',
      converted_paying: 'Paying',
      lost: 'Lost',
      active: 'Active',
      completed: 'Completed',
    };
    return map[status] ?? status;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      consulting: 'bg-amber-100 text-amber-700',
      converted: 'bg-blue-100 text-blue-700',
      converted_paid: 'bg-green-100 text-green-700',
      converted_paying: 'bg-green-100 text-green-700',
      lost: 'bg-red-100 text-red-700',
      active: 'bg-blue-100 text-blue-700',
      completed: 'bg-slate-100 text-slate-600',
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
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
    return this.paymentsForItem(ci).reduce((s, p) => s + parseFloat(p.total_paid || '0'), 0);
  }

  balanceForItem(ci: CartItem): number {
    return Math.max(0, this.totalForItem(ci) - this.paidForItem(ci));
  }

  removable(ci: CartItem): boolean {
    return this.paymentsForItem(ci).length === 0;
  }

  onRemove(ci: CartItem) {
    const c = this.consultation();
    if (!c) return;
    this.removing.set(true);
    this.consultationService.deleteCartItem(ci.id).subscribe({
      next: () => {
        this.removing.set(false);
        this.messageService.add({ severity: 'success', summary: 'Product removed' });
        this.load(c.id);
      },
      error: (err) => {
        this.removing.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Could not remove',
          detail: err.error?.detail || 'Products with a payment cannot be removed',
        });
      },
    });
  }

  addProduct() {
    const c = this.consultation();
    if (!c) return;
    this.router.navigate(['/sales'], {
      queryParams: { upsell: '1', id: c.id, phone: c.phone },
    });
  }

  collectPayment() {
    const c = this.consultation();
    if (!c) return;
    this.router.navigate(['/payments'], { queryParams: { phone: c.phone } });
  }

  back() {
    this.router.navigate(['/sales']);
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }
}
