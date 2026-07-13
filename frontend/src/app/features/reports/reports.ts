import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { CommissionService, CommissionSummaryItem } from '../../core/services/commission.service';
import { FuelService, FuelReportItem, FuelReportResponse } from '../../core/services/fuel.service';
import { ReportsService, DashboardSummary } from '../../core/services/reports.service';

@Component({
  selector: 'app-reports',
  imports: [
    CommonModule, FormsModule, ButtonModule, ToastModule,
    TableModule, TabsModule, SelectModule, DatePickerModule, TagModule,
  ],
  providers: [MessageService],
  templateUrl: './reports.html',
})
export class ReportsCmp implements OnInit {
  activeTab = signal<'overview' | 'commissions' | 'fuel' | 'financial'>('overview');

  // Dashboard summary
  summary = signal<DashboardSummary | null>(null);

  // Commission report
  commissionReport = signal<CommissionSummaryItem[]>([]);
  commissionTotals = signal<{ grand_total: number; grand_paid: number; grand_pending: number }>({ grand_total: 0, grand_paid: 0, grand_pending: 0 });

  // Fuel report
  fuelReport = signal<FuelReportItem[]>([]);
  fuelTotals = signal<{ grand_total: number; grand_liters: number | null; grand_lessons_covered: number }>({ grand_total: 0, grand_liters: null, grand_lessons_covered: 0 });
  fuelDateFrom = signal<string>('');
  fuelDateTo = signal<string>('');

  loading = signal(false);

  constructor(
    private reportsSvc: ReportsService,
    private commissionSvc: CommissionService,
    private fuelSvc: FuelService,
    private msg: MessageService,
  ) {}

  ngOnInit() {
    this.loadOverview();
  }

  loadOverview() {
    this.loading.set(true);
    this.reportsSvc.getDashboard().subscribe(s => {
      this.summary.set(s);
      this.loading.set(false);
    });
  }

  loadCommissionReport() {
    this.loading.set(true);
    this.commissionSvc.getSummary().subscribe(r => {
      this.commissionReport.set(r.items);
      this.commissionTotals.set({ grand_total: r.grand_total, grand_paid: r.grand_paid, grand_pending: r.grand_pending });
      this.loading.set(false);
    });
  }

  loadFuelReport() {
    this.loading.set(true);
    this.fuelSvc.getReport({
      date_from: this.fuelDateFrom() || undefined,
      date_to: this.fuelDateTo() || undefined,
    }).subscribe(r => {
      this.fuelReport.set(r.items);
      this.fuelTotals.set({ grand_total: r.grand_total, grand_liters: r.grand_liters, grand_lessons_covered: r.grand_lessons_covered });
      this.loading.set(false);
    });
  }

  onTabChange(tab: any) {
    this.activeTab.set(tab);
    if (tab === 'commissions') this.loadCommissionReport();
    if (tab === 'fuel') this.loadFuelReport();
  }
}
