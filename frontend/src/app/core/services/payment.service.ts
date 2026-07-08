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
  total_amount: string;
  total_paid: string;
  balance: string;
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

export interface ClientSummary {
  id: string;
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  location: string | null;
  interest_level: string | null;
  active_products_count: number;
  upgradable_products_count: number;
  total_paid: string;
  last_payment_date: string | null;
  created_at: string;
}

export interface ClientListResponse {
  clients: ClientSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private http: HttpClient) {}

  getPayment(id: string) {
    return this.http.get<PaymentRead>(`/api/v1/payments/${id}`);
  }

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

  listClients(params?: { search?: string; page?: number; page_size?: number }) {
    let hp = new HttpParams();
    if (params) {
      if (params.search) hp = hp.set('search', params.search);
      if (params.page) hp = hp.set('page', params.page);
      if (params.page_size) hp = hp.set('page_size', params.page_size);
    }
    return this.http.get<ClientListResponse>('/api/v1/clients/', { params: hp });
  }

  getClient(id: string) {
    return this.http.get(`/api/v1/clients/${id}`);
  }

  checkReceipt(receiptNumber: string) {
    return this.http.get<{ exists: boolean }>(`/api/v1/payments/check-receipt/${encodeURIComponent(receiptNumber)}`);
  }

  getReceipt(paymentId: string, download: boolean = false) {
    const url = `/api/v1/receipts/${paymentId}/download${download ? '?download=1' : ''}`;
    return this.http.get(url, { responseType: 'text' });
  }

  getConsolidatedReceipt(receiptNumber: string, consultationId: string, download: boolean = false) {
    let params = new HttpParams().set('consultation_id', consultationId);
    if (download) params = params.set('download', '1');
    const url = `/api/v1/receipts/by-number/${encodeURIComponent(receiptNumber)}`;
    return this.http.get(url, { responseType: 'text', params });
  }
}
