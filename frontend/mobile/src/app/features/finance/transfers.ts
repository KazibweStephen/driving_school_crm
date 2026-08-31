import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import {
  FinanceService,
  Branch,
  BranchTransfer,
  UnremittedClientPayment,
  HoFundingClient,
  BranchCashPosition,
} from '../../core/services/finance.service';
import { LoadingOverlay } from '../../shared/loading-overlay/loading-overlay';
import { formatMoney } from '../../shared/format';

type Direction = 'all' | 'incoming' | 'outgoing';

@Component({
  selector: 'app-transfers',
  imports: [
    CommonModule, FormsModule, RouterLink, ButtonModule, InputTextModule,
    SelectModule, InputNumberModule, DialogModule, ConfirmDialogModule, ToastModule, LoadingOverlay,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './transfers.html',
})
export class Transfers implements OnInit {
  private finance = inject(FinanceService);
  private auth = inject(AuthService);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);

  currency = this.auth.currencyCode;
  perms = this.auth.permissions;
  loading = signal(true);
  transfers = signal<BranchTransfer[]>([]);
  direction = signal<Direction>('all');

  branches = signal<Branch[]>([]);
  headOfficeId = '';
  positions = signal<BranchCashPosition[]>([]);

  showSend = signal(false);
  sendSaving = signal(false);
  sendForm = {
    from_branch_id: '',
    to_branch_id: '',
    pool: 'petty_cash',
    method: 'cash',
    reference: '',
    amount: 0,
    reason: '',
  };
  sendAmountInput: number | null = null;
  unremitted = signal<UnremittedClientPayment[]>([]);
  unremittedSearch = signal('');
  selectedPayments = signal<UnremittedClientPayment[]>([]);
  sendAmounts: Record<string, number> = {};
  receiptFile: File | null = null;

  showFund = signal(false);
  fundSaving = signal(false);
  fundToBranchId = '';
  fundClients = signal<HoFundingClient[]>([]);
  fundSearch = signal('');
  selectedFunding = signal<HoFundingClient[]>([]);
  fundAmounts: Record<string, number> = {};

  methodOptions = [
    { label: 'Cash', value: 'cash' },
    { label: 'Mobile Money', value: 'mobile_money' },
    { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Cheque', value: 'cheque' },
  ];
  poolOptions = [
    { label: 'Petty Cash', value: 'petty_cash' },
    { label: 'Client Accounts', value: 'client_accounts' },
  ];

  has = (code: string) => this.perms().includes(code);

  ngOnInit() {
    this.loadMeta();
    this.load();
  }

  private async loadMeta() {
    try {
      this.branches.set((await this.finance.myBranches().toPromise()) ?? []);
    } catch {
      this.branches.set([]);
    }
    const companyId = this.auth.currentUserCompanyId();
    if (companyId) {
      try {
        const c = await this.finance.getCompany(companyId).toPromise();
        this.headOfficeId = c?.head_office_branch_id || '';
      } catch {
        this.headOfficeId = '';
      }
    }
  }

  load() {
    this.loading.set(true);
    this.finance.listTransfers({ direction: this.direction(), page_size: 100 }).subscribe({
      next: (res) => {
        this.transfers.set(res.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.transfers.set([]);
        this.loading.set(false);
      },
    });
  }

  setDirection(d: string) {
    this.direction.set(d as Direction);
    this.load();
  }

  money(value: string | number) {
    return formatMoney(Number(value || 0), this.currency());
  }

  datetime(value?: string): string {
    return value ? new Date(value).toLocaleString() : '';
  }

  statusClass(s: string): string {
    switch (s) {
      case 'received': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-amber-100 text-amber-700';
    }
  }

  poolName(p: string): string {
    return p === 'client_accounts' ? 'Client Accounts' : 'Petty Cash';
  }

  branchName(id: string): string {
    return this.branches().find((b) => b.id === id)?.name || (id || '').substring(0, 8);
  }

  canReceive(t: BranchTransfer): boolean {
    return t.status === 'initiated' && this.has('transfers.receive');
  }
  canCancel(t: BranchTransfer): boolean {
    return t.status === 'initiated' && this.has('transfers.cancel');
  }

  poolById(poolName: string): { net_in_hand: number; collected: number; received: number; remitted: number; pending_remitted: number; expenses: number; outstanding: number } {
    const b = this.positions().find((x) => x.branch_id === this.sendForm.from_branch_id);
    const p = b?.pools?.find((x) => x.pool === poolName);
    return p || { net_in_hand: 0, collected: 0, received: 0, remitted: 0, pending_remitted: 0, expenses: 0, outstanding: 0 };
  }

  openSend() {
    const branches = this.branches();
    this.loadPositions();
    this.sendForm = {
      from_branch_id: branches[0]?.id || '',
      to_branch_id: this.headOfficeId || branches.find((b) => b.id !== branches[0]?.id)?.id || '',
      pool: 'petty_cash',
      method: 'cash',
      reference: '',
      amount: 0,
      reason: '',
    };
    this.sendAmountInput = null;
    this.receiptFile = null;
    this.selectedPayments.set([]);
    this.sendAmounts = {};
    this.unremitted.set([]);
    this.unremittedSearch.set('');
    this.showSend.set(true);
    if (this.sendForm.from_branch_id && this.sendForm.pool === 'client_accounts') {
      this.loadUnremitted(this.sendForm.from_branch_id);
    }
  }

  loadPositions() {
    this.finance.getCashPosition().subscribe({ next: (res) => this.positions.set(res || []) });
  }

  loadUnremitted(branchId: string) {
    this.finance.getUnremittedClientPayments(branchId).subscribe({
      next: (res) => this.unremitted.set(res || []),
      error: () => this.unremitted.set([]),
    });
  }

  onSendPoolChange() {
    this.selectedPayments.set([]);
    this.sendAmounts = {};
    this.sendAmountInput = null;
    if (this.sendForm.pool === 'client_accounts' && this.sendForm.from_branch_id) {
      this.loadUnremitted(this.sendForm.from_branch_id);
    } else {
      this.unremitted.set([]);
    }
  }

  onSendFromChange() {
    this.selectedPayments.set([]);
    this.sendAmounts = {};
    this.sendAmountInput = null;
    if (this.sendForm.pool === 'client_accounts' && this.sendForm.from_branch_id) {
      this.loadUnremitted(this.sendForm.from_branch_id);
    } else {
      this.unremitted.set([]);
    }
  }

  filteredUnremitted() {
    const q = (this.unremittedSearch() || '').trim().toLowerCase();
    const all = this.unremitted();
    if (!q) return all;
    return all.filter((p) => (p.client_name || '').toLowerCase().includes(q) || (p.client_phone || p.phone || '').toLowerCase().includes(q));
  }

  togglePayment(p: UnremittedClientPayment) {
    const sel = this.selectedPayments();
    const exists = sel.some((s) => s.payment_id === p.payment_id);
    if (exists) {
      this.selectedPayments.set(sel.filter((s) => s.payment_id !== p.payment_id));
      delete this.sendAmounts[p.payment_id];
    } else {
      this.selectedPayments.set([...sel, p]);
      this.sendAmounts[p.payment_id] = Number(p.amount || 0);
    }
    this.recomputeSendAmount();
  }

  isPaymentSelected(id: string): boolean {
    return this.selectedPayments().some((s) => s.payment_id === id);
  }

  paymentName(p: UnremittedClientPayment): string {
    return p.client_name || 'Client';
  }
  paymentPhone(p: UnremittedClientPayment): string {
    return p.client_phone || p.phone || '';
  }

  setPaymentAmount(id: string, value: number | null) {
    const p = this.unremitted().find((x) => x.payment_id === id);
    const cap = p ? Number(p.amount || 0) : 0;
    let amt = Number(value || 0);
    if (amt < 0) amt = 0;
    if (amt > cap) amt = cap;
    this.sendAmounts[id] = amt;
    this.recomputeSendAmount();
  }

  paymentAmount(id: string): number {
    return this.sendAmounts[id] ?? 0;
  }

  recomputeSendAmount() {
    this.sendForm.amount = this.selectedPayments().reduce((s, p) => s + Number(this.sendAmounts[p.payment_id] ?? p.amount ?? 0), 0);
    this.sendAmountInput = this.sendForm.amount;
  }

  onManualAmountChange() {
    this.sendForm.amount = Number(this.sendAmountInput || 0);
  }

  availableForFromPool(): number {
    return this.poolById(this.sendForm.pool).net_in_hand;
  }

  sendValid(): boolean {
    if (!this.sendForm.from_branch_id || !this.sendForm.to_branch_id) return false;
    if (this.sendForm.from_branch_id === this.sendForm.to_branch_id) return false;
    const available = Math.max(0, this.availableForFromPool());
    if (this.sendForm.amount <= 0 || this.sendForm.amount > available + 0.001) return false;
    if (this.sendForm.pool === 'client_accounts') {
      return this.selectedPayments().length > 0;
    }
    return true;
  }

  onSendReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.receiptFile = input.files?.[0] || null;
  }

  async submitSend() {
    this.sendSaving.set(true);
    try {
      let receipt_url: string | undefined;
      if (this.receiptFile) {
        const up = await this.finance.uploadTransferReceipt(this.receiptFile).toPromise();
        receipt_url = up?.url;
      }
      const payment_amounts = this.selectedPayments()
        .map((p) => ({ payment_id: p.payment_id, amount: Number(this.sendAmounts[p.payment_id] ?? p.amount ?? 0) }))
        .filter((i) => i.amount > 0);
      await this.finance.createTransfer({
        from_branch_id: this.sendForm.from_branch_id,
        to_branch_id: this.sendForm.to_branch_id,
        amount: this.sendForm.amount,
        reason: this.sendForm.reason || undefined,
        pool: this.sendForm.pool,
        method: this.sendForm.method,
        reference: this.sendForm.reference || undefined,
        payment_amounts: payment_amounts.length ? payment_amounts : undefined,
        receipt_url,
      }).toPromise();
      this.showSend.set(false);
      this.msg.add({ severity: 'success', summary: 'Sent', detail: 'Transfer initiated' });
      this.load();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to send money' });
    } finally {
      this.sendSaving.set(false);
    }
  }

  openFund() {
    this.loadPositions();
    this.fundToBranchId = branchesToFunding(this.branches(), this.headOfficeId);
    this.fundClients.set([]);
    this.fundSearch.set('');
    this.selectedFunding.set([]);
    this.fundAmounts = {};
    this.showFund.set(true);
    if (this.fundToBranchId) this.loadFundingClients();
  }

  onFundBranchChange() {
    this.selectedFunding.set([]);
    this.fundAmounts = {};
    this.fundClients.set([]);
    if (this.fundToBranchId) this.loadFundingClients();
  }

  loadFundingClients() {
    this.finance.getHoFundingClients().subscribe({
      next: (res) => this.fundClients.set(res || []),
      error: () => this.fundClients.set([]),
    });
  }

  filteredFunding() {
    const q = (this.fundSearch() || '').trim().toLowerCase();
    const all = this.fundClients();
    if (!q) return all;
    return all.filter((c) => c.client_name.toLowerCase().includes(q) || c.client_phone.toLowerCase().includes(q));
  }

  toggleFunding(c: HoFundingClient) {
    const sel = this.selectedFunding();
    if (sel.some((s) => s.consultation_id === c.consultation_id)) {
      this.selectedFunding.set(sel.filter((s) => s.consultation_id !== c.consultation_id));
      delete this.fundAmounts[c.consultation_id];
    } else {
      this.selectedFunding.set([...sel, c]);
      this.fundAmounts[c.consultation_id] = c.available_to_fund;
    }
  }

  isFundingSelected(id: string): boolean {
    return this.selectedFunding().some((s) => s.consultation_id === id);
  }

  setFundAmount(id: string, value: number | null, cap: number) {
    let amt = Number(value || 0);
    if (amt < 0) amt = 0;
    if (amt > cap) amt = cap;
    this.fundAmounts[id] = amt;
  }

  fundAmount(id: string): number {
    return this.fundAmounts[id] ?? 0;
  }

  fundTotal(): number {
    return this.selectedFunding().reduce((s, c) => s + Number(this.fundAmounts[c.consultation_id] || 0), 0);
  }

  fundingValid(): boolean {
    if (!this.fundToBranchId || this.fundToBranchId === this.headOfficeId || this.selectedFunding().length === 0) return false;
    return this.selectedFunding().every((c) => {
      const a = Number(this.fundAmounts[c.consultation_id] || 0);
      return a > 0 && a <= c.available_to_fund;
    }) && this.fundTotal() > 0;
  }

  async submitFund() {
    this.fundSaving.set(true);
    try {
      const items = this.selectedFunding()
        .map((c) => ({ consultation_id: c.consultation_id, amount: Number(this.fundAmounts[c.consultation_id] || 0) }))
        .filter((i) => i.amount > 0);
      await this.finance.createHoFunding({
        to_branch_id: this.fundToBranchId,
        items,
        method: 'cash',
        reason: 'Head office client funding',
      }).toPromise();
      this.showFund.set(false);
      this.msg.add({ severity: 'success', summary: 'Funded', detail: 'Client funds sent to branch' });
      this.load();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to fund branch' });
    } finally {
      this.fundSaving.set(false);
    }
  }

  confirmReceive(t: BranchTransfer) {
    this.confirm.confirm({
      message: `Receive ${this.money(t.amount)} from ${t.from_branch_name || this.branchName(t.from_branch_id)}?`,
      header: 'Accept Transfer',
      accept: async () => {
        try {
          await this.finance.receiveTransfer(t.id).toPromise();
          this.msg.add({ severity: 'success', summary: 'Received', detail: 'Transfer received' });
          this.load();
        } catch (e: any) {
          this.msg.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to receive transfer' });
        }
      },
    });
  }

  confirmCancel(t: BranchTransfer) {
    this.confirm.confirm({
      message: `Cancel (reject) this transfer of ${this.money(t.amount)}?`,
      header: 'Reject Transfer',
      accept: async () => {
        try {
          await this.finance.cancelTransfer(t.id).toPromise();
          this.msg.add({ severity: 'success', summary: 'Cancelled', detail: 'Transfer rejected' });
          this.load();
        } catch (e: any) {
          this.msg.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed to cancel transfer' });
        }
      },
    });
  }
}

function branchesToFunding(branches: Branch[], headOfficeId: string): string {
  return branches.find((b) => b.id !== headOfficeId)?.id || '';
}
