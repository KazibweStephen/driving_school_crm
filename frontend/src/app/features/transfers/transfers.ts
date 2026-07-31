import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import { FinanceService, BranchTransfer, TransferSummary } from '../../core/services/finance.service';

interface DirectionOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-transfers',
  imports: [
    FormsModule, ButtonModule, CardModule, ConfirmDialogModule, DialogModule,
    InputTextModule, InputNumberModule, MultiSelectModule, SelectModule, TableModule, TagModule,
    ToastModule, TooltipModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './transfers.html',
  styleUrl: './transfers.css',
})
export class TransfersCmp implements OnInit {
  transfers = signal<BranchTransfer[]>([]);
  summary: TransferSummary = {
    outgoing_initiated: 0,
    outgoing_received: 0,
    incoming_initiated: 0,
    incoming_received: 0,
    total_outgoing: 0,
    total_incoming: 0,
  };
  loading = signal(false);
  total = 0;
  page = 1;
  pageSize = 20;

  branches: Branch[] = [];
  selectedBranchIds: string[] = [];
  direction = 'all';
  statusFilter: string | null = null;

  showCreateDialog = signal(false);
  saving = signal(false);
  newTransfer: { from_branch_id: string; to_branch_id: string; amount: number | null; reason: string } = {
    from_branch_id: '',
    to_branch_id: '',
    amount: null,
    reason: '',
  };

  directionOptions: DirectionOption[] = [
    { label: 'All', value: 'all' },
    { label: 'Incoming', value: 'incoming' },
    { label: 'Outgoing', value: 'outgoing' },
  ];

  statusOptions = [
    { label: 'Initiated', value: 'initiated' },
    { label: 'Received', value: 'received' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
  ) {}

  async ngOnInit() {
    await this.loadBranches();
    await this.loadTransfers();
    await this.loadSummary();
  }

  async loadBranches() {
    try {
      const res = await this.companyService.myBranches().toPromise();
      this.branches = res || [];
      this.selectedBranchIds = this.branches.map(b => b.id);
    } catch {
      this.branches = [];
    }
  }

  branchName(id: string): string {
    return this.branches.find(b => b.id === id)?.name || id.substring(0, 8);
  }

  async loadTransfers() {
    this.loading.set(true);
    try {
      const branch_id = this.selectedBranchIds.length === 1
        ? this.selectedBranchIds[0]
        : undefined;
      const res = await this.financeService.listTransfers({
        branch_id,
        direction: this.direction || undefined,
        status: this.statusFilter || undefined,
        page: this.page,
        page_size: this.pageSize,
      }).toPromise();
      if (res) {
        this.transfers.set(res.items);
        this.total = res.total;
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load transfers' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadSummary() {
    try {
      const res = await this.financeService.getTransferSummary().toPromise();
      if (res) this.summary = res;
    } catch {}
  }

  applyFilters() {
    this.page = 1;
    this.loadTransfers();
  }

  clearFilters() {
    this.direction = 'all';
    this.statusFilter = null;
    this.selectedBranchIds = this.branches.map(b => b.id);
    this.page = 1;
    this.loadTransfers();
  }

  onPage(event: any) {
    this.page = (event.first / event.rows) + 1;
    this.pageSize = event.rows;
    this.loadTransfers();
  }

  openCreateDialog() {
    this.newTransfer = {
      from_branch_id: this.branches[0]?.id || '',
      to_branch_id: this.branches[1]?.id || this.branches[0]?.id || '',
      amount: null,
      reason: '',
    };
    this.showCreateDialog.set(true);
  }

  async createTransfer() {
    if (!this.newTransfer.from_branch_id || !this.newTransfer.to_branch_id) {
      this.messageService.add({ severity: 'warn', summary: 'Missing', detail: 'Select from and to branches' });
      return;
    }
    if (this.newTransfer.from_branch_id === this.newTransfer.to_branch_id) {
      this.messageService.add({ severity: 'warn', summary: 'Invalid', detail: 'From and to branches must be different' });
      return;
    }
    if (!this.newTransfer.amount || this.newTransfer.amount <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Missing', detail: 'Enter a valid amount' });
      return;
    }
    this.saving.set(true);
    try {
      await this.financeService.createTransfer({
        from_branch_id: this.newTransfer.from_branch_id,
        to_branch_id: this.newTransfer.to_branch_id,
        amount: this.newTransfer.amount,
        reason: this.newTransfer.reason || undefined,
      }).toPromise();
      this.showCreateDialog.set(false);
      await this.loadTransfers();
      await this.loadSummary();
      this.messageService.add({ severity: 'success', summary: 'Initiated', detail: 'Transfer created' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to create transfer' });
    } finally {
      this.saving.set(false);
    }
  }

  confirmReceive(t: BranchTransfer) {
    this.confirmationService.confirm({
      message: `Confirm receipt of ${this.formatAmount(t.amount)} from ${this.branchName(t.from_branch_id)}?`,
      header: 'Receive Transfer',
      icon: 'pi pi-arrow-down-left',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.receive(t),
    });
  }

  async receive(t: BranchTransfer) {
    try {
      await this.financeService.receiveTransfer(t.id).toPromise();
      await this.loadTransfers();
      await this.loadSummary();
      this.messageService.add({ severity: 'success', summary: 'Received', detail: 'Transfer received' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to receive transfer' });
    }
  }

  confirmCancel(t: BranchTransfer) {
    this.confirmationService.confirm({
      message: `Cancel transfer of ${this.formatAmount(t.amount)} to ${this.branchName(t.to_branch_id)}?`,
      header: 'Cancel Transfer',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.cancel(t),
    });
  }

  async cancel(t: BranchTransfer) {
    try {
      await this.financeService.cancelTransfer(t.id).toPromise();
      await this.loadTransfers();
      await this.loadSummary();
      this.messageService.add({ severity: 'success', summary: 'Cancelled', detail: 'Transfer cancelled' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to cancel transfer' });
    }
  }

  statusSeverity(t: BranchTransfer): 'success' | 'info' | 'danger' | 'warn' {
    switch (t.status) {
      case 'received': return 'success';
      case 'cancelled': return 'danger';
      default: return 'warn';
    }
  }

  statusLabel(t: BranchTransfer): string {
    return t.status.charAt(0).toUpperCase() + t.status.slice(1);
  }

  formatAmount(val: string | number): string {
    const n = typeof val === 'number' ? val : parseFloat(val);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleString();
  }

  canReceive(t: BranchTransfer): boolean {
    if (t.status !== 'initiated') return false;
    const role = this.authService.currentUserRole();
    const privileged = role === 'super_user' || role === 'office_admin' || role === 'manager' || role === 'branch_supervisor';
    if (privileged) return true;
    return this.selectedBranchIds.length === 1 && this.selectedBranchIds[0] === t.to_branch_id;
  }

  canCancel(t: BranchTransfer): boolean {
    if (t.status !== 'initiated') return false;
    const role = this.authService.currentUserRole();
    const privileged = role === 'super_user' || role === 'office_admin' || role === 'manager' || role === 'branch_supervisor';
    if (privileged) return true;
    return this.selectedBranchIds.length === 1 && this.selectedBranchIds[0] === t.from_branch_id;
  }
}
