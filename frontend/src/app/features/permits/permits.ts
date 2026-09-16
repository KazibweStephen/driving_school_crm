import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';
import { PaginatorModule } from 'primeng/paginator';
import { MessageService } from 'primeng/api';
import { PermitProgressService, PermitTracker } from '../../core/services/permit-progress.service';
import { PaymentService, BranchInfo } from '../../core/services/payment.service';

interface StatusOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-permits',
  imports: [
    CommonModule, FormsModule, RouterLink, ButtonModule, TableModule,
    TagModule, ToastModule, InputTextModule, SelectModule, MultiSelectModule,
    TooltipModule, CardModule, PaginatorModule,
  ],
  providers: [MessageService],
  templateUrl: './permits.html',
})
export class PermitsCmp implements OnInit {
  trackers = signal<PermitTracker[]>([]);
  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;
  search = '';
  status = '';
  branches: BranchInfo[] = [];
  selectedBranchIds: string[] = [];

  statusOptions: StatusOption[] = [
    { label: 'All', value: '' },
    { label: 'Not Qualified', value: 'not_qualified' },
    { label: 'Eligible', value: 'eligible' },
    { label: 'Learners Active', value: 'learners_active' },
    { label: 'Due For Testing', value: 'due_for_testing' },
    { label: 'Test Ready', value: 'test_ready' },
    { label: 'Waiting For Permit', value: 'waiting_for_permit' },
    { label: 'Permit Paid', value: 'permit_paid' },
    { label: 'Permit Received', value: 'permit_received' },
  ];

  constructor(
    private permitService: PermitProgressService,
    private paymentService: PaymentService,
    private router: Router,
    private messageService: MessageService,
  ) {}

  get totalTrackers(): number {
    return this.total;
  }

  get dueForTesting(): number {
    return this.trackers().filter(t => t.status === 'due_for_testing').length;
  }

  get testReady(): number {
    return this.trackers().filter(t => t.status === 'test_ready').length;
  }

  get permitPaid(): number {
    return this.trackers().filter(t => t.status === 'permit_paid').length;
  }

  async ngOnInit() {
    try {
      this.branches = await this.paymentService.getAccessibleBranches().toPromise() || [];
      this.selectedBranchIds = this.branches.map(b => b.id);
    } catch {
      this.branches = [];
      this.selectedBranchIds = [];
    }
    this.loadTrackers();
  }

  applyFilters() {
    this.page = 1;
    this.loadTrackers();
  }

  clearFilters() {
    this.search = '';
    this.status = '';
    this.selectedBranchIds = this.branches.map(b => b.id);
    this.page = 1;
    this.loadTrackers();
  }

  async loadTrackers() {
    this.loading.set(true);
    try {
      const branch_ids = this.selectedBranchIds.length
        ? this.selectedBranchIds.join(',')
        : undefined;
      const res = await this.permitService.listTrackers({
        search: this.search || undefined,
        branch_ids,
        status: this.status || undefined,
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.trackers.set(res.trackers);
        this.total = res.total;
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load permit trackers' });
    } finally {
      this.loading.set(false);
    }
  }

  onPage(event: any) {
    this.page = (event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadTrackers();
  }

  onSearch() {
    this.applyFilters();
  }

  viewTracker(t: PermitTracker) {
    this.router.navigate(['/consultations', t.consultation_id]);
  }

  formatAmount(val: number): string {
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  statusSeverity(t: PermitTracker): string {
    switch (t.status) {
      case 'eligible': return 'info';
      case 'learners_active': return 'success';
      case 'due_for_testing': return 'warn';
      case 'test_ready': return 'secondary';
      case 'waiting_for_permit': return 'warn';
      case 'permit_paid': return 'success';
      case 'permit_received': return 'success';
      default: return 'secondary';
    }
  }

  statusLabel(t: PermitTracker): string {
    switch (t.status) {
      case 'not_qualified': return 'Not Qualified';
      case 'eligible': return 'Eligible';
      case 'learners_active': return 'Learners Active';
      case 'due_for_testing': return 'Due For Testing';
      case 'test_ready': return 'Test Ready';
      case 'waiting_for_permit': return 'Waiting For Permit';
      case 'permit_paid': return 'Permit Paid';
      case 'permit_received': return 'Permit Received';
      default: return t.status;
    }
  }

  statusClass(t: PermitTracker): string {
    switch (t.status) {
      case 'not_qualified': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'eligible': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'learners_active': return 'bg-green-50 text-green-700 border-green-200';
      case 'due_for_testing': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'test_ready': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'waiting_for_permit': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'permit_paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'permit_received': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }
}