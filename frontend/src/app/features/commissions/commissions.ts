import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CommissionService, CommissionRate, Commission, CommissionSummaryItem } from '../../core/services/commission.service';
import { ProductService, Package } from '../../core/services/product.service';

@Component({
  selector: 'app-commissions',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, MultiSelectModule, ConfirmDialogModule, TableModule, TagModule, TabsModule, DatePickerModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './commissions.html',
})
export class CommissionsCmp implements OnInit {
  rates = signal<CommissionRate[]>([]);
  commissions = signal<Commission[]>([]);
  summary = signal<CommissionSummaryItem[]>([]);
  summaryTotals = signal<{ grand_total: number; grand_paid: number; grand_pending: number }>({ grand_total: 0, grand_paid: 0, grand_pending: 0 });
  packages = signal<Package[]>([]);

  showRateDialog = signal(false);
  editingRate = signal<CommissionRate | null>(null);

  rateForm = {
    package_ids: [] as string[],
    total_amount: null as number | null,
    converter_pct: 0,
    primary_recommender_pct: 0,
    secondary_recommender_pct: 0,
    active_from: null as string | null,
    active_until: null as string | null,
    notes: '',
  };

  filterStatus = signal<string>('');
  activeTab = signal<'rates' | 'commissions' | 'report'>('rates');

  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;

  constructor(
    private svc: CommissionService,
    private productSvc: ProductService,
    private msg: MessageService,
    private confirm: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadRates();
  }

  loadRates() {
    this.svc.listRates().subscribe(r => this.rates.set(r));
  }

  loadCommissions() {
    this.loading.set(true);
    this.svc.list({ status: this.filterStatus() || undefined, page: this.page, page_size: this.pageSize })
      .subscribe(r => {
        this.commissions.set(r.items);
        this.total = r.total;
        this.loading.set(false);
      });
  }

  loadSummary() {
    this.loading.set(true);
    this.svc.getSummary().subscribe(r => {
      this.summary.set(r.items);
      this.summaryTotals.set({ grand_total: r.grand_total, grand_paid: r.grand_paid, grand_pending: r.grand_pending });
      this.loading.set(false);
    });
  }

  loadPackages() {
    this.productSvc.listProducts({ page: 1, page_size: 100 }).subscribe(res => {
      const all: Package[] = [];
      for (const p of res.products) {
        if (p.packages) all.push(...p.packages);
      }
      this.packages.set(all);
    });
  }

  getTotalPct(): number {
    return (this.rateForm.converter_pct || 0)
      + (this.rateForm.primary_recommender_pct || 0)
      + (this.rateForm.secondary_recommender_pct || 0);
  }

  openNewRate() {
    this.editingRate.set(null);
    this.rateForm = {
      package_ids: [],
      total_amount: null,
      converter_pct: 0,
      primary_recommender_pct: 0,
      secondary_recommender_pct: 0,
      active_from: null,
      active_until: null,
      notes: '',
    };
    this.loadPackages();
    this.showRateDialog.set(true);
  }

  editRate(rate: CommissionRate) {
    this.editingRate.set(rate);
    this.loadPackages();
    this.rateForm = {
      package_ids: [...rate.package_ids],
      total_amount: Number(rate.total_amount),
      converter_pct: Number(rate.converter_pct),
      primary_recommender_pct: Number(rate.primary_recommender_pct),
      secondary_recommender_pct: Number(rate.secondary_recommender_pct),
      active_from: rate.active_from,
      active_until: rate.active_until,
      notes: rate.notes || '',
    };
    this.showRateDialog.set(true);
  }

  private toDateStr(d: any): string | undefined {
    if (!d) return undefined;
    if (typeof d === 'string') return d;
    if (d instanceof Date) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return undefined;
  }

  saveRate() {
    const data: any = {
      package_ids: this.rateForm.package_ids,
      total_amount: this.rateForm.total_amount ?? 0,
      converter_pct: this.rateForm.converter_pct,
      primary_recommender_pct: this.rateForm.primary_recommender_pct,
      secondary_recommender_pct: this.rateForm.secondary_recommender_pct,
      active_from: this.toDateStr(this.rateForm.active_from),
      active_until: this.toDateStr(this.rateForm.active_until),
      notes: this.rateForm.notes || undefined,
    };
    const obs = this.editingRate()
      ? this.svc.updateRate(this.editingRate()!.id, data)
      : this.svc.createRate(data);
    obs.subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: this.editingRate() ? 'Rate updated' : 'Rate created' });
        this.showRateDialog.set(false);
        this.loadRates();
      },
      error: (err) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.detail || 'Failed to save' }),
    });
  }

  deactivateRate(rate: CommissionRate) {
    const label = rate.package_names?.length ? rate.package_names.join(', ') : rate.package_ids.join(', ');
    this.confirm.confirm({
      message: `Deactivate rate for "${label}"?`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.svc.deleteRate(rate.id).subscribe(() => {
          this.msg.add({ severity: 'success', summary: 'Rate deactivated' });
          this.loadRates();
        });
      },
    });
  }

  payCommission(c: Commission) {
    this.svc.update(c.id, { status: 'paid' } as any).subscribe(() => {
      this.msg.add({ severity: 'success', summary: 'Commission marked paid' });
      this.loadCommissions();
    });
  }

  onPageChange(event: any) {
    this.page = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadCommissions();
  }

  onTabChange(tab: any) {
    this.activeTab.set(tab);
    if (tab === 'rates' && this.rates().length === 0) this.loadRates();
    if (tab === 'commissions') this.loadCommissions();
    if (tab === 'report') this.loadSummary();
  }
}
