import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { CompanyService, Branch } from '../../core/services/company.service';
import {
  FinanceService, BranchCashPosition, PoolPosition,
} from '../../core/services/finance.service';
import { ConsultationService, ClientInfo } from '../../core/services/consultation.service';
import { PaymentService, PaymentRead } from '../../core/services/payment.service';
import { CurrencyService } from '../../core/services/currency.service';

interface Pool {
  id: string;
  name: string;
}

interface Method {
  label: string;
  value: string;
}

interface LinkablePayment {
  payment_id: string;
  consultation_id: string;
  amount: number;
  client_name?: string;
  client_phone?: string;
}

@Component({
  selector: 'app-cash-position',
  imports: [
    CommonModule, FormsModule, ButtonModule, CardModule, DialogModule, FileUploadModule,
    InputTextModule, InputNumberModule, SelectModule, TagModule, ToastModule,
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

  clientResults = signal<ClientInfo[]>([]);
  clientSearching = signal(false);
  clientQuery = signal('');
  linkablePayments = signal<LinkablePayment[]>([]);
  selectedPayments = signal<LinkablePayment[]>([]);
  linkableLoading = signal(false);

  constructor(
    private financeService: FinanceService,
    private companyService: CompanyService,
    private authService: AuthService,
    private consultationService: ConsultationService,
    private paymentService: PaymentService,
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
      pool: poolId, collected: 0, remitted: 0, pending_remitted: 0, expenses: 0, net_in_hand: 0,
    };
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
    this.clientResults.set([]);
    this.clientQuery.set('');
    this.linkablePayments.set([]);
    this.selectedPayments.set([]);
    this.showSendDialog.set(true);
  }

  async searchClient(q: string) {
    this.clientQuery.set(q);
    const search = (q || '').trim();
    if (search.length < 2) {
      this.clientResults.set([]);
      return;
    }
    this.clientSearching.set(true);
    try {
      const res = await this.consultationService.clientSearch(search).toPromise();
      this.clientResults.set(res || []);
    } catch {
      this.clientResults.set([]);
    } finally {
      this.clientSearching.set(false);
    }
  }

  async selectClient(c: ClientInfo) {
    this.clientQuery.set(`${c.first_name}${c.last_name ? ' ' + c.last_name : ''} · ${c.phone}`);
    this.clientResults.set([]);
    if (!c.latest_consultation_id) {
      this.messageService.add({ severity: 'warn', summary: 'No consultation', detail: 'No consultation to link payments from' });
      return;
    }
    this.linkableLoading.set(true);
    try {
      const payments = (await this.paymentService.getPaymentsByConsultation(c.latest_consultation_id).toPromise()) || [];
      const links: LinkablePayment[] = payments.map(p => ({
        payment_id: p.id,
        consultation_id: c.latest_consultation_id!,
        amount: Number(p.total_paid ?? p.balance ?? 0),
        client_name: `${c.first_name}${c.last_name ? ' ' + c.last_name : ''}`,
        client_phone: c.phone,
      }));
      this.linkablePayments.set(links);
    } catch {
      this.linkablePayments.set([]);
      this.messageService.add({ severity: 'warn', summary: 'No payments', detail: 'Could not load payments for this client' });
    } finally {
      this.linkableLoading.set(false);
    }
  }

  togglePayment(p: LinkablePayment) {
    const selected = this.selectedPayments();
    const exists = selected.some(s => s.payment_id === p.payment_id);
    this.selectedPayments.set(exists ? selected.filter(s => s.payment_id !== p.payment_id) : [...selected, p]);
  }

  isPaymentSelected(paymentId: string): boolean {
    return this.selectedPayments().some(s => s.payment_id === paymentId);
  }

  clearClient() {
    this.clientQuery.set('');
    this.clientResults.set([]);
    this.linkablePayments.set([]);
    this.selectedPayments.set([]);
  }

  sendFormValid(): boolean {
    if (!this.sendForm.from_branch_id || !this.sendForm.to_branch_id) return false;
    if (this.sendForm.from_branch_id === this.sendForm.to_branch_id) return false;
    if (!this.sendForm.amount || this.sendForm.amount <= 0) return false;
    return true;
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

  formatAmount(n: number): string {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
