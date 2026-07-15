import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { SmsService, SmsLog } from '../../core/services/sms.service';
import { CurrencyService } from '../../core/services/currency.service';

@Component({
  selector: 'app-sms-logs',
  imports: [
    CommonModule, DecimalPipe, FormsModule, ButtonModule, TableModule, TagModule,
    ToastModule, InputTextModule, SelectModule, TooltipModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">SMS Logs</h1>

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input pInputText [(ngModel)]="filterPhone" placeholder="Search phone..."
          class="w-48" (keyup.enter)="loadLogs()" />
        <p-select [(ngModel)]="filterStatus" [options]="statusOptions"
          optionLabel="label" optionValue="value" placeholder="All statuses"
          styleClass="w-40" appendTo="body" (onChange)="loadLogs()" [showClear]="true" />
        <p-select [(ngModel)]="filterTrigger" [options]="triggerOptions"
          optionLabel="label" optionValue="value" placeholder="All triggers"
          styleClass="w-56" appendTo="body" (onChange)="loadLogs()" [showClear]="true" />
        <p-button label="Search" icon="pi pi-search" (onClick)="loadLogs()" />
        <p-button label="Clear" severity="secondary" text (onClick)="clearFilters()" />
      </div>

      <div class="flex gap-4 mb-4 text-sm">
        <span class="px-3 py-1.5 bg-gray-100 rounded">Total SMS: <strong>{{ total() }}</strong></span>
        <span class="px-3 py-1.5 bg-gray-100 rounded">Total Units: <strong>{{ totalUnits() }}</strong></span>
        <span class="px-3 py-1.5 bg-gray-100 rounded">Total Cost: <strong>{{ currencyService.symbol() }} {{ totalCost() | number:'1.2-2' }}</strong></span>
      </div>

      <p-table [value]="logs()" [loading]="loading()" dataKey="id"
        [rows]="10" [paginator]="true" [rowsPerPageOptions]="[10,25,50]"
        styleClass="p-datatable-sm" [totalRecords]="total()"
        (onPage)="onPage($event)">
        <ng-template pTemplate="header">
          <tr>
            <th>Date & Time</th>
            <th>Phone</th>
            <th>Message</th>
            <th>Length</th>
            <th>Units</th>
            <th>Cost</th>
            <th>Provider</th>
            <th>Trigger</th>
            <th>Status</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-log>
          <tr>
            <td class="whitespace-nowrap">{{ log.sent_at | date:'medium' }}</td>
            <td class="font-mono text-sm">{{ log.phone }}</td>
            <td class="text-sm text-gray-700 max-w-sm">
              <span [pTooltip]="log.message" tooltipPosition="top" class="truncate block max-w-xs">{{ log.message }}</span>
            </td>
            <td class="text-center">{{ log.message_length }}</td>
            <td class="text-center">{{ log.sms_units }}</td>
            <td>{{ currencyService.symbol() }} {{ log.cost | number:'1.2-2' }}</td>
            <td><p-tag [value]="log.provider" severity="info" /></td>
            <td>
              @if (log.trigger_event) {
                <p-tag [value]="log.trigger_event" severity="warn" />
              } @else {
                <span class="text-gray-400 text-sm">manual</span>
              }
            </td>
            <td>
              <p-tag [value]="log.status" [severity]="log.status === 'sent' ? 'success' : 'danger'" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="9" class="text-center text-gray-500 py-8">No SMS logs found</td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class SmsLogsCmp implements OnInit {
  private smsService = inject(SmsService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  currencyService = inject(CurrencyService);

  logs = signal<SmsLog[]>([]);
  loading = signal(false);
  total = signal(0);
  totalUnits = signal(0);
  totalCost = signal(0);
  companyId: string | null = null;

  filterPhone = '';
  filterStatus: string | null = null;
  filterTrigger: string | null = null;
  currentPage = 1;
  pageSize = 10;

  statusOptions = [
    { label: 'Sent', value: 'sent' },
    { label: 'Failed', value: 'failed' },
  ];

  triggerOptions = [
    { label: 'User Created', value: 'user_created' },
    { label: 'PIN Reset', value: 'pin_reset' },
    { label: 'Consultation Created', value: 'consultation_created' },
    { label: 'Payment Received', value: 'payment_received' },
    { label: 'Installment Due', value: 'installment_due' },
    { label: 'Installment Overdue', value: 'installment_overdue' },
    { label: 'Cart Item Converted', value: 'cart_item_converted' },
    { label: 'Expense Approved', value: 'expense_approved' },
    { label: 'Lesson Scheduled', value: 'lesson_scheduled' },
    { label: 'Lesson Cancelled', value: 'lesson_cancelled' },
    { label: 'Lesson Reminder', value: 'lesson_reminder' },
    { label: 'Training Completed', value: 'training_completed' },
    { label: 'Permit Expiring', value: 'permit_expiring' },
    { label: 'Manual', value: 'manual' },
  ];

  ngOnInit() {
    this.companyId = this.authService.currentUserCompanyId();
    if (this.companyId) {
      this.loadLogs();
    }
  }

  async loadLogs() {
    if (!this.companyId) return;
    this.loading.set(true);
    try {
      const res = await this.smsService.listLogs(
        this.companyId,
        this.filterPhone || undefined,
        this.filterStatus || undefined,
        this.filterTrigger || undefined,
        this.currentPage,
        this.pageSize,
      ).toPromise();
      if (res) {
        this.logs.set(res.logs);
        this.total.set(res.total);
        this.totalUnits.set(res.total_units);
        this.totalCost.set(res.total_cost);
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load SMS logs' });
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters() {
    this.filterPhone = '';
    this.filterStatus = null;
    this.filterTrigger = null;
    this.currentPage = 1;
    this.loadLogs();
  }

  onPage(event: any) {
    this.currentPage = event.page + 1;
    this.pageSize = event.rows;
    this.loadLogs();
  }
}
