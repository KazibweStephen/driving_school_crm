import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Branch {
  id: string;
  name: string;
  code: string;
  head_office?: boolean;
}

export interface UnremittedClientPayment {
  payment_id: string;
  consult_name?: string;
  client_name?: string;
  client_phone?: string;
  phone?: string;
  amount: string | number;
  document_date?: string;
}

export interface HoFundingClient {
  consultation_id: string;
  client_name: string;
  client_phone: string;
  available_to_fund: number;
}

export interface BranchCashPosition {
  branch_id: string;
  branch_name: string;
  pools: PoolPosition[];
}

export interface PoolPosition {
  pool: string;
  collected: number;
  received: number;
  remitted: number;
  pending_remitted: number;
  expenses: number;
  net_in_hand: number;
  outstanding: number;
}

export interface BranchTransfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  amount: string | number;
  reason?: string;
  pool?: string;
  method?: string;
  reference?: string;
  receipt_url?: string;
  status: 'initiated' | 'received' | 'cancelled';
  initiated_by?: string;
  initiated_at: string;
  received_by?: string;
  received_at?: string;
  from_branch_name?: string;
  to_branch_name?: string;
  initiated_by_name?: string;
  received_by_name?: string;
  payment_links?: { payment_id: string; amount: number; client_name?: string; client_phone?: string }[];
}

export interface BranchTransferListResponse {
  items: BranchTransfer[];
  total: number;
  page: number;
  page_size: number;
}

export interface CompanyInfo {
  id: string;
  name: string;
  head_office_branch_id?: string;
  currency?: string;
}

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private base = '/api/v1/finance';

  constructor(private http: HttpClient) {}

  myBranches(): Observable<Branch[]> {
    return this.http.get<Branch[]>('/api/v1/companies/my-branches');
  }

  getCompany(id: string): Observable<CompanyInfo> {
    return this.http.get<CompanyInfo>(`/api/v1/companies/${id}`);
  }

  getCashPosition(): Observable<BranchCashPosition[]> {
    return this.http.get<BranchCashPosition[]>(`${this.base}/cash-position`);
  }

  getUnremittedClientPayments(branchId: string, search?: string): Observable<UnremittedClientPayment[]> {
    let params = new HttpParams().set('branch_id', branchId);
    if (search) params = params.set('search', search);
    return this.http.get<UnremittedClientPayment[]>(`${this.base}/cash-position/unremitted-client-payments`, { params });
  }

  getHoFundingClients(): Observable<HoFundingClient[]> {
    return this.http.get<HoFundingClient[]>(`${this.base}/cash-position/ho-funding-clients`);
  }

  createHoFunding(data: { to_branch_id: string; items: { consultation_id: string; amount: number }[]; method?: string; reference?: string; reason?: string }): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/ho-funding`, data);
  }

  listTransfers(params?: { direction?: string; status?: string; page?: number; page_size?: number }): Observable<BranchTransferListResponse> {
    let p = new HttpParams();
    if (params?.direction) p = p.set('direction', params.direction);
    if (params?.status) p = p.set('status', params.status);
    p = p.set('page', String(params?.page || 1));
    p = p.set('page_size', String(params?.page_size || 50));
    return this.http.get<BranchTransferListResponse>(`${this.base}/transfers`, { params: p });
  }

  createTransfer(data: {
    from_branch_id: string;
    to_branch_id: string;
    amount: number;
    reason?: string;
    pool?: string;
    method?: string;
    reference?: string;
    payment_amounts?: { payment_id: string; amount: number }[];
    payment_ids?: string[];
    receipt_url?: string;
  }): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers`, data);
  }

  receiveTransfer(id: string, receiptUrl?: string): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers/${id}/receive`, { receipt_url: receiptUrl });
  }

  cancelTransfer(id: string): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers/${id}/cancel`, {});
  }

  uploadTransferReceipt(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/transfers/upload-receipt`, fd);
  }
}
