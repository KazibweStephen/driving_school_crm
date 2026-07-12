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
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CommissionService, CommissionRate, Commission, CommissionReportItem } from '../../core/services/commission.service';

@Component({
  selector: 'app-commissions',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TextareaModule, ToastModule,
    SelectModule, ConfirmDialogModule, TableModule, TagModule, TabsModule, DatePickerModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './commissions.html',
})
export class CommissionsCmp implements OnInit {
  rates = signal<CommissionRate[]>([]);
  commissions = signal<Commission[]>([]);
  report = signal<CommissionReportItem[]>([]);
  reportTotals = signal<{ grand_total: number; grand_paid: number; grand_pending: number }>({ grand_total: 0, grand_paid: 0, grand_pending: 0 });

  showRateDialog = signal(false);
  showCommissionDialog = signal(false);
  editingRate = signal<CommissionRate | null>(null);
  editingCommission = signal<Commission | null>(null);

  rateForm = { name: '', amount: 0, lesson_type: '', transmission_type: '', notes: '' };
  commissionForm = { instructor_id: '', amount: 0, notes: '' };

  filterStatus = signal<string>('');
  reportDateFrom = signal<string>('');
  reportDateTo = signal<string>('');
  activeTab = signal<'rates' | 'commissions' | 'report'>('commissions');

  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;

  constructor(
    private svc: CommissionService,
    private msg: MessageService,
    private confirm: ConfirmationService,
  ) {}

  ngOnInit() {
    this.loadCommissions();
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

  loadReport() {
    this.loading.set(true);
    this.svc.getReport({
      date_from: this.reportDateFrom() || undefined,
      date_to: this.reportDateTo() || undefined,
    }).subscribe(r => {
      this.report.set(r.items);
      this.reportTotals.set({ grand_total: r.grand_total, grand_paid: r.grand_paid, grand_pending: r.grand_pending });
      this.loading.set(false);
    });
  }

  openNewRate() {
    this.editingRate.set(null);
    this.rateForm = { name: '', amount: 0, lesson_type: '', transmission_type: '', notes: '' };
    this.showRateDialog.set(true);
  }

  editRate(rate: CommissionRate) {
    this.editingRate.set(rate);
    this.rateForm = {
      name: rate.name,
      amount: Number(rate.amount),
      lesson_type: rate.lesson_type || '',
      transmission_type: rate.transmission_type || '',
      notes: rate.notes || '',
    };
    this.showRateDialog.set(true);
  }

  saveRate() {
    if (this.editingRate()) {
      this.svc.updateRate(this.editingRate()!.id, this.rateForm).subscribe(() => {
        this.msg.add({ severity: 'success', summary: 'Rate updated' });
        this.showRateDialog.set(false);
        this.loadRates();
      });
    } else {
      this.svc.createRate(this.rateForm).subscribe(() => {
        this.msg.add({ severity: 'success', summary: 'Rate created' });
        this.showRateDialog.set(false);
        this.loadRates();
      });
    }
  }

  deleteRate(rate: CommissionRate) {
    this.confirm.confirm({
      message: `Delete rate "${rate.name}"?`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.svc.deleteRate(rate.id).subscribe(() => {
          this.msg.add({ severity: 'success', summary: 'Deleted' });
          this.loadRates();
        });
      },
    });
  }

  payCommission(c: Commission) {
    this.svc.update(c.id, { status: 'paid', paid_at: new Date().toISOString() }).subscribe(() => {
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
    if (tab === 'report') this.loadReport();
  }
}
