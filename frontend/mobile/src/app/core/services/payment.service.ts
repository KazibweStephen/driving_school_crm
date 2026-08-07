import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  created_at: string;
  updated_at: string;
  installments: InstallmentRead[];
}

export interface InstallmentUpdate {
  paid_date?: string;
  paid_amount?: number;
  notes?: string;
}

export interface BranchInfo {
  id: string;
  name: string;
  code: string;
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

  downloadReceipt(paymentId: string) {
    return this.http.get(`/api/v1/receipts/${paymentId}/download`, {
      responseType: 'blob',
    });
  }
}
