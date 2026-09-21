import { Component, computed, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { AuthService } from '../../core/auth/auth.service';
import {
  PaymentService,
  BranchInfo,
} from '../../core/services/payment.service';
import {
  PermitService,
  PermitTracker,
} from '../../core/services/permit.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { PageHeader } from '../../shared/page-header/page-header';
import { formatMoney } from '../../shared/format';
import { PermitStagesDialog } from './permit-stages-dialog';

interface StatusOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-permits',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    SelectModule,
    MultiSelectModule,
    LoadingOverlay,
    PageHeader,
    PermitStagesDialog,
  ],
  providers: [MessageService],
  templateUrl: './permits.html',
})
export class PermitsList {
  private auth = inject(AuthService);
  private paymentService = inject(PaymentService);
  private permitService = inject(PermitService);
  private messageService = inject(MessageService);

  @ViewChild(PermitStagesDialog) stagesDialog!: PermitStagesDialog;

  currency = this.auth.currencyCode;

  trackers = signal<PermitTracker[]>([]);
  loading = signal(false);
  total = signal(0);
  page = signal(1);
  pageSize = 15;

  search = '';
  status = '';
  sortBy = '';
  branches = signal<BranchInfo[]>([]);
  selectedBranchIds = signal<string[]>([]);

  statusOptions: StatusOption[] = [
    { label: 'All', value: '' },
    { label: 'Not Qualified', value: 'not_qualified' },
    { label: 'Eligible', value: 'eligible' },
    { label: 'Learners Pending Approval', value: 'learner_pending_approval' },
    { label: 'Learners Pending Payment', value: 'learner_pending_payment' },
    { label: 'Learners Paid', value: 'learner_paid' },
    { label: 'Learners Active', value: 'learners_active' },
    { label: 'Due For Testing', value: 'due_for_testing' },
    { label: 'Testing Pending Approval', value: 'test_pending_approval' },
    { label: 'Testing Pending Payment', value: 'test_pending_payment' },
    { label: 'Test Ready', value: 'test_ready' },
    { label: 'Waiting For Permit', value: 'waiting_for_permit' },
    { label: 'Permit Pending Approval', value: 'permit_pending_approval' },
    { label: 'Permit Pending Payment', value: 'permit_pending_payment' },
    { label: 'Permit Paid', value: 'permit_paid' },
    { label: 'Permit Received', value: 'permit_received' },
  ];

  dueForTesting = computed(
    () => this.trackers().filter((t) => t.status === 'due_for_testing').length,
  );
  testReady = computed(
    () => this.trackers().filter((t) => t.status === 'test_ready').length,
  );
  permitPaid = computed(
    () => this.trackers().filter((t) => t.status === 'permit_paid').length,
  );

  hasMore = computed(() => this.trackers().length < this.total());

  constructor() {
    this.loadBranches();
    this.loadTrackers();
  }

  private loadBranches() {
    this.paymentService.getAccessibleBranches().subscribe({
      next: (branches) => {
        this.branches.set(branches);
        if (branches.length === 1) {
          this.selectedBranchIds.set([branches[0].id]);
        } else if (branches.length > 1) {
          this.selectedBranchIds.set(branches.map((b) => b.id));
        }
      },
      error: () => {},
    });
  }

  applyFilters() {
    this.page.set(1);
    this.loadTrackers();
  }

  clearFilters() {
    this.search = '';
    this.status = '';
    this.sortBy = '';
    this.page.set(1);
    this.loadTrackers();
  }

  toggleDocDateSort() {
    this.sortBy = this.sortBy === '' ? 'document_date_desc'
      : this.sortBy === 'document_date_desc' ? 'document_date_asc' : '';
    this.applyFilters();
  }

  loadTrackers() {
    this.loading.set(true);
    const branchIds = this.selectedBranchIds();
    this.permitService
      .listPermitTrackers({
        search: this.search || undefined,
        status: this.status || undefined,
        sort_by: this.sortBy || undefined,
        branch_ids: branchIds.length ? branchIds : undefined,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.trackers.set(
            this.page() === 1 ? res.trackers : [...this.trackers(), ...res.trackers],
          );
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({ severity: 'error', summary: 'Could not load permits' });
        },
      });
  }

  loadMore() {
    this.page.update((p) => p + 1);
    this.loadTrackers();
  }

  openStagesDialog(t: PermitTracker) {
    this.stagesDialog.open(t);
  }

  onStagesChanged() {
    this.loadTrackers();
  }

  packageLabel(t: PermitTracker): string {
    return t.package_name || t.product_name;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      not_qualified: 'Not Qualified',
      eligible: 'Eligible',
      learner_pending_approval: 'Learners Pending Approval',
      learner_pending_payment: 'Learners Pending Payment',
      learner_paid: 'Learners Paid',
      learners_active: 'Learners Active',
      due_for_testing: 'Due For Testing',
      test_pending_approval: 'Testing Pending Approval',
      test_pending_payment: 'Testing Pending Payment',
      test_ready: 'Test Ready',
      waiting_for_permit: 'Waiting For Permit',
      permit_pending_approval: 'Permit Pending Approval',
      permit_pending_payment: 'Permit Pending Payment',
      permit_paid: 'Permit Paid',
      permit_received: 'Permit Received',
    };
    return map[status] ?? status;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      not_qualified: 'bg-gray-100 text-gray-700',
      eligible: 'bg-blue-50 text-blue-700',
      learner_pending_approval: 'bg-amber-50 text-amber-700',
      learner_pending_payment: 'bg-blue-50 text-blue-700',
      learner_paid: 'bg-emerald-50 text-emerald-700',
      learners_active: 'bg-green-50 text-green-700',
      due_for_testing: 'bg-amber-50 text-amber-700',
      test_pending_approval: 'bg-orange-50 text-orange-700',
      test_pending_payment: 'bg-purple-50 text-purple-700',
      test_ready: 'bg-purple-50 text-purple-700',
      waiting_for_permit: 'bg-orange-50 text-orange-700',
      permit_pending_approval: 'bg-orange-50 text-orange-700',
      permit_pending_payment: 'bg-blue-50 text-blue-700',
      permit_paid: 'bg-emerald-50 text-emerald-700',
      permit_received: 'bg-green-100 text-green-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  dayLine(value: number | null): string {
    if (value == null) return '';
    if (value === 0) return 'today';
    return value > 0 ? `${value}d` : `${value}d ago`;
  }

  money(value: string | number) {
    return formatMoney(value, this.currency());
  }
}