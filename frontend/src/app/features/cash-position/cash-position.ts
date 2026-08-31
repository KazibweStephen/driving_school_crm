import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import {
  FinanceService, BranchCashPosition, PoolPosition, UnremittedClientPayment, HoFundingClient,
} from '../../core/services/finance.service';
import { CurrencyService } from '../../core/services/currency.service';

interface Pool {
  id: string;
  name: string;
}

interface Method {
  label: string;
  value: string;
}

@Component({
  selector: 'app-cash-position',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DialogModule, FileUploadModule,
    InputTextModule, InputNumberModule, SelectModule, SelectButtonModule, TagModule, ToastModule,
    RouterModule,
  ],
  providers: [MessageService],
  templateUrl: './cash-position.html',
})
export class CashPositionCmp implements OnInit {
  positions = signal<BranchCashPosition[]>([]);
  loading = signal(false);
  branches: Branch[] = [];
  headOfficeId = '';

  poolOptions: Pool[] = [
    { id: 'petty_cash', name: 'Petty Cash' },
    { id: 'client_accounts', name: 'Client Accounts' },
  ];
  methodOptions: Method[] = [
    { label: 'Cash', value: 'cash' },
    { label: 'Mobile Money', value: 'mobile_money' },
    { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Cheque', value: 'cheque' },
  ];

  showSendDialog = signal(false);
  saving = signal(false);
  sendForm = {
    from_branch_id: '',
    to_branch_id: '',
    pool: 'petty_cash',
    method: 'cash',
    reference: '',
    amount: 0,
    reason: '',
  };
  receiptFile: File | null = null;

  unremitted = signal<UnremittedClientPayment[]>([]);
  filteredPayments = signal<UnremittedClientPayment[]>([]);
  unremittedLoading = signal(false);
  paymentSearch = signal('');
  selectedPayments = signal<UnremittedClientPayment[]>([]);

  showFundingDialog = signal(false);
  fundingLoading = signal(false);
  fundingSaving = signal(false);
  fundingClients = signal<HoFundingClient[]>([]);
  fundingSearch = signal('');
  fundingToBranchId = '';
  selectedFunding = signal<HoFundingClient[]>([]);
  fundingAmounts: Record<string, number> = {};

  readonly Math = Math;

  viewMode = signal<'card' | 'list'>('card');
  viewOptions = [
    { label: 'Cards', value: 'card', icon: 'pi pi-th-large' },
    { label: 'List', value: 'list', icon: 'pi pi-list' },
  ];

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private authService: AuthService,
    private messageService: MessageService,
    public currencyService: CurrencyService,
  ) {}

  async ngOnInit() {
    await this.loadMeta();
    await this.loadPositions();
  }

  private async loadMeta() {
    try {
      this.branches = (await this.companyService.myBranches().toPromise()) || [];
    } catch {
      this.branches = [];
    }
    const companyId = this.authService.currentUserCompanyId();
    if (companyId) {
      try {
        const company = await this.companyService.get(companyId).toPromise();
        this.headOfficeId = company?.head_office_branch_id || '';
      } catch {
        this.headOfficeId = '';
      }
    }
  }

  async loadPositions() {
    this.loading.set(true);
    try {
      const res = await this.financeService.getCashPosition().toPromise();
      this.positions.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load cash position' });
    } finally {
      this.loading.set(false);
    }
  }

  poolById(branch: BranchCashPosition, poolId: string): PoolPosition {
    return branch.pools.find(p => p.pool === poolId) ?? {
      pool: poolId, collected: 0, received: 0, remitted: 0, pending_remitted: 0, expenses: 0, net_in_hand: 0, outstanding: 0,
    };
  }

  availableForFromBranch(pool: string): number {
    const branch = this.positions().find(b => b.branch_id === this.sendForm.from_branch_id);
    return branch ? this.poolById(branch, pool).net_in_hand : 0;
  }

  branchName(id: string): string {
    return this.branches.find(b => b.id === id)?.name || id.substring(0, 8);
  }

  branchIsHeadOffice(id: string): boolean {
    return !!this.headOfficeId && id === this.headOfficeId;
  }

  openSendDialog() {
    this.sendForm = {
      from_branch_id: this.branches[0]?.id || '',
      to_branch_id: this.headOfficeId || this.branches.find(b => b.id !== this.branches[0]?.id)?.id || '',
      pool: 'petty_cash',
      method: 'cash',
      reference: '',
      amount: 0,
      reason: '',
    };
    this.unremitted.set([]);
    this.filteredPayments.set([]);
    this.paymentSearch.set('');
    this.selectedPayments.set([]);
    this.showSendDialog.set(true);
    if (this.sendForm.from_branch_id) {
      this.loadUnremitted(this.sendForm.from_branch_id);
    }
  }

  async loadUnremitted(branchId: string) {
    if (!branchId) {
      this.unremitted.set([]);
      this.filteredPayments.set([]);
      return;
    }
    this.unremittedLoading.set(true);
    try {
      const payments = (await this.financeService.getUnremittedClientPayments(branchId).toPromise()) || [];
      this.unremitted.set(payments);
      this.applyPaymentFilter();
    } catch {
      this.unremitted.set([]);
      this.filteredPayments.set([]);
      this.messageService.add({ severity: 'warn', summary: 'No payments', detail: 'Could not load unremitted client payments' });
    } finally {
      this.unremittedLoading.set(false);
    }
  }

  onFromBranchChange() {
    this.selectedPayments.set([]);
    this.sendForm.amount = 0;
    this.paymentSearch.set('');
    if (this.sendForm.from_branch_id) {
      this.loadUnremitted(this.sendForm.from_branch_id);
    } else {
      this.unremitted.set([]);
      this.filteredPayments.set([]);
    }
  }

  onPoolChange() {
    this.selectedPayments.set([]);
    this.sendForm.amount = 0;
    this.paymentSearch.set('');
    if (this.sendForm.pool === 'client_accounts') {
      if (this.sendForm.from_branch_id) {
        this.loadUnremitted(this.sendForm.from_branch_id);
      } else {
        this.unremitted.set([]);
        this.filteredPayments.set([]);
      }
    } else {
      this.unremitted.set([]);
      this.filteredPayments.set([]);
    }
  }

  applyPaymentFilter() {
    const q = (this.paymentSearch() || '').trim().toLowerCase();
    const all = this.unremitted();
    if (!q) {
      this.filteredPayments.set(all);
      return;
    }
    this.filteredPayments.set(all.filter(p =>
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.client_phone || '').toLowerCase().includes(q)
    ));
  }

  togglePayment(p: UnremittedClientPayment) {
    const selected = this.selectedPayments();
    const exists = selected.some(s => s.payment_id === p.payment_id);
    const next = exists ? selected.filter(s => s.payment_id !== p.payment_id) : [...selected, p];
    this.selectedPayments.set(next);
    this.sendForm.amount = next.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  }

  isPaymentSelected(paymentId: string): boolean {
    return this.selectedPayments().some(s => s.payment_id === paymentId);
  }

  sendFormValid(): boolean {
    if (!this.sendForm.from_branch_id || !this.sendForm.to_branch_id) return false;
    if (this.sendForm.from_branch_id === this.sendForm.to_branch_id) return false;
    const available = Math.max(0, this.availableForFromBranch(this.sendForm.pool));
    const withinAvailable = this.sendForm.amount > 0 && this.sendForm.amount <= available + 0.001;
    if (this.sendForm.pool === 'client_accounts') {
      return this.selectedPayments().length > 0 && withinAvailable;
    }
    return withinAvailable;
  }

  async sendMoney() {
    this.saving.set(true);
    try {
      const payment_ids = this.selectedPayments().map(p => p.payment_id);
      let receipt_url: string | undefined;
      if (this.receiptFile) {
        const up = await this.financeService.uploadTransferReceipt(this.receiptFile).toPromise();
        receipt_url = up?.url;
      }
      await this.financeService.createTransfer({
        from_branch_id: this.sendForm.from_branch_id,
        to_branch_id: this.sendForm.to_branch_id,
        amount: this.sendForm.amount,
        reason: this.sendForm.reason || undefined,
        pool: this.sendForm.pool,
        method: this.sendForm.method,
        reference: this.sendForm.reference || undefined,
        payment_ids: payment_ids.length ? payment_ids : undefined,
        receipt_url,
      }).toPromise();
      this.showSendDialog.set(false);
      this.receiptFile = null;
      await this.loadPositions();
      this.messageService.add({ severity: 'success', summary: 'Sent', detail: 'Money remitted to head office' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to send money' });
    } finally {
      this.saving.set(false);
    }
  }

  onReceiptSelected(event: any) {
    this.receiptFile = event?.files?.[0] || event?.currentFiles?.[0] || null;
  }

  clearReceipt() {
    this.receiptFile = null;
  }

  onFundingBranchChange() {
    this.selectedFunding.set([]);
    this.fundingAmounts = {};
    if (this.fundingToBranchId) {
      this.loadFundingClients();
    } else {
      this.fundingClients.set([]);
    }
  }

  async loadFundingClients() {
    this.fundingLoading.set(true);
    try {
      const clients = (await this.financeService.getHoFundingClients().toPromise()) || [];
      this.fundingClients.set(clients);
    } catch {
      this.fundingClients.set([]);
      this.messageService.add({ severity: 'warn', summary: 'No funding', detail: 'Could not load head-office client balances' });
    } finally {
      this.fundingLoading.set(false);
    }
  }

  openFundingDialog() {
    this.fundingToBranchId = '';
    this.fundingClients.set([]);
    this.fundingSearch.set('');
    this.selectedFunding.set([]);
    this.fundingAmounts = {};
    this.showFundingDialog.set(true);
  }

  get filteredFundingClients(): HoFundingClient[] {
    const q = (this.fundingSearch() || '').trim().toLowerCase();
    if (!q) return this.fundingClients();
    return this.fundingClients().filter(c =>
      c.client_name.toLowerCase().includes(q) || c.client_phone.toLowerCase().includes(q)
    );
  }

  toggleFundingClient(c: HoFundingClient) {
    const sel = this.selectedFunding();
    this.selectedFunding.set(sel.some(s => s.consultation_id === c.consultation_id)
      ? sel.filter(s => s.consultation_id !== c.consultation_id)
      : [...sel, c]);
  }

  isFundingSelected(consultationId: string): boolean {
    return this.selectedFunding().some(s => s.consultation_id === consultationId);
  }

  fundingTotal(): number {
    return this.selectedFunding().reduce((sum, c) => sum + (Number(this.fundingAmounts[c.consultation_id] || 0)), 0);
  }

  fundingOverCap(c: HoFundingClient): boolean {
    return (Number(this.fundingAmounts[c.consultation_id] || 0) || 0) > c.available_to_fund;
  }

  fundingValid(): boolean {
    if (!this.fundingToBranchId || this.selectedFunding().length === 0) return false;
    if (this.branchIsHeadOffice(this.fundingToBranchId)) return false;
    return this.selectedFunding().every(c => {
      const a = Number(this.fundingAmounts[c.consultation_id] || 0);
      return a > 0 && a <= c.available_to_fund;
    }) && this.fundingTotal() > 0;
  }

  async sendFunding() {
    this.fundingSaving.set(true);
    try {
      const items = this.selectedFunding()
        .map(c => ({ consultation_id: c.consultation_id, amount: Number(this.fundingAmounts[c.consultation_id] || 0) }))
        .filter(i => i.amount > 0);
      await this.financeService.createHoFunding({
        to_branch_id: this.fundingToBranchId,
        items,
        method: 'cash',
        reason: 'Head office client funding',
      }).toPromise();
      this.showFundingDialog.set(false);
      await this.loadPositions();
      this.messageService.add({ severity: 'success', summary: 'Funded', detail: 'Client funds sent to branch' });
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to fund branch' });
    } finally {
      this.fundingSaving.set(false);
    }
  }

  formatAmount(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
