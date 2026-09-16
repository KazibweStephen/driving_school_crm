import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface InstallmentCreate {
  due_date: string;
  amount: number;
}

export interface PaymentCreate {
  product_id: string;
  package_id?: string;
  total_amount: number;
  notes?: string;
  receipt_number?: string;
  installments: InstallmentCreate[];
  document_date?: string;
  branch_id?: string;
}

export interface InstallmentRead {
  id: string;
  payment_id: string;
  due_date: string;
  amount: string;
  status: string;
  paid_date: string | null;
  paid_amount: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRead {
  id: string;
  consultation_id: string;
  product_id: string;
  package_id: string | null;
  branch_id: string | null;
  total_amount: string;
  total_paid: string;
  balance: string;
  document_date: string | null;
  notes: string | null;
  receipt_number: string | null;
  system_receipt_number: string;
  transaction_id: string;
  created_at: string;
  updated_at: string;
  installments: InstallmentRead[];
}

export interface InstallmentFutureAdjust {
  installment_id: string;
  due_date: string;
}

export interface InstallmentUpdate {
  paid_date?: string;
  paid_amount?: number;
  notes?: string;
  push_forward_date?: string;
  future_installments?: InstallmentFutureAdjust[];
}

export interface ScheduleAdjustment {
  installment_id: string;
  due_date: string;
}

export interface CollectionPayment {
  product_id: string;
  package_id?: string;
  amount: number;
  branch_id?: string;
  document_date?: string;
  receipt_number?: string;
  notes?: string;
  schedule_adjustments?: ScheduleAdjustment[];
  future_schedule?: InstallmentCreate[];
}

export interface BranchInfo {
  id: string;
  name: string;
  code: string;
}

export interface PaymentGroupTotals {
  total_amount_sum: string;
  total_paid_sum: string;
  total_balance_sum: string;
}

export interface PaymentGroup {
  consultation_id: string;
  client_name: string;
  client_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  product_id: string;
  product_name: string;
  package_id: string | null;
  package_name: string | null;
  total_amount: string;
  total_paid: string;
  balance: string;
  payment_count: number;
  first_document_date: string | null;
  last_document_date: string | null;
}

export interface PaymentGroupListResponse {
  groups: PaymentGroup[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  totals: PaymentGroupTotals;
}

export interface PaymentWithClient {
  id: string;
  consultation_id: string;
  product_id: string;
  product_name: string;
  package_id: string | null;
  branch_id: string | null;
  branch_name: string | null;
  client_name: string;
  client_phone: string;
  created_by_name: string | null;
  total_amount: string;
  total_paid: string;
  balance: string;
  document_date: string | null;
  notes: string | null;
  receipt_number: string | null;
  system_receipt_number: string;
  transaction_id: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}

export interface PaymentTotals {
  total_amount_sum: string;
  total_paid_sum: string;
  total_balance_sum: string;
}

export interface PaymentListResponse {
  payments: PaymentWithClient[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  totals: PaymentTotals;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private http: HttpClient) {}

  getPaymentsByConsultation(consultationId: string) {
    return this.http.get<PaymentRead[]>(`/api/v1/consultations/${consultationId}/payments`);
  }

  createPayment(consultationId: string, data: PaymentCreate) {
    return this.http.post<PaymentRead>(`/api/v1/consultations/${consultationId}/payments`, data);
  }

  collectPayment(consultationId: string, data: CollectionPayment) {
    return this.http.post<PaymentRead>(
      `/api/v1/consultations/${consultationId}/payments/collect`,
      data,
    );
  }

  updateInstallment(paymentId: string, installmentId: string, data: InstallmentUpdate) {
    return this.http.patch<InstallmentRead>(
      `/api/v1/payments/${paymentId}/installments/${installmentId}`,
      data,
    );
  }

  checkReceipt(receiptNumber: string) {
    return this.http.get<{ exists: boolean }>(
      `/api/v1/payments/check-receipt/${encodeURIComponent(receiptNumber)}`,
    );
  }

  getAccessibleBranches() {
    return this.http.get<BranchInfo[]>('/api/v1/payments/accessible-branches/');
  }

  listPaymentGroups(params: {
    search?: string;
    date_from?: string;
    date_to?: string;
    branch_ids?: string[];
    page?: number;
    page_size?: number;
  }) {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.date_from) p = p.set('date_from', params.date_from);
    if (params.date_to) p = p.set('date_to', params.date_to);
    if (params.branch_ids?.length) p = p.set('branch_ids', params.branch_ids.join(','));
    if (params.page != null) p = p.set('page', String(params.page));
    if (params.page_size != null) p = p.set('page_size', String(params.page_size));
    return this.http.get<PaymentGroupListResponse>('/api/v1/payments/grouped/', { params: p });
  }

  listAllPayments(params: {
    search?: string;
    date_from?: string;
    date_to?: string;
    branch_ids?: string[];
    sort?: string;
    client_type?: string;
    page?: number;
    page_size?: number;
  }) {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.date_from) p = p.set('date_from', params.date_from);
    if (params.date_to) p = p.set('date_to', params.date_to);
    if (params.branch_ids?.length) p = p.set('branch_ids', params.branch_ids.join(','));
    if (params.sort) p = p.set('sort', params.sort);
    if (params.client_type) p = p.set('client_type', params.client_type);
    if (params.page != null) p = p.set('page', String(params.page));
    if (params.page_size != null) p = p.set('page_size', String(params.page_size));
    return this.http.get<PaymentListResponse>('/api/v1/payments/', { params: p });
  }

  downloadReceipt(paymentId: string, amount?: number) {
    const query = amount != null ? `?amount=${encodeURIComponent(String(amount))}` : '';
    return this.http.get(`/api/v1/receipts/${paymentId}/download${query}`, {
      responseType: 'blob',
    });
  }
}
