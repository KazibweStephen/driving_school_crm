import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Expense {
  id: string;
  branch_id: string;
  amount: number;
  description?: string;
  category?: string;
  mileage?: number;
  vehicle_id?: string;
  consultation_id?: string;
  client_name?: string;
  status: string;
  approved_by?: string;
  approved_at?: string;
  paid_by?: string;
  paid_at?: string;
  rejection_reason?: string;
  receipt_url?: string;
  expense_date: string;
  created_by_phone?: string;
  created_at: string;
}

export interface ExpenseCreate {
  branch_id: string;
  amount: number;
  description?: string;
  category?: string;
  mileage?: number;
  vehicle_id?: string;
  consultation_id?: string;
  expense_date?: string | Date;
  status?: string;
  receipt_url?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  requires_client: boolean;
  is_operating: boolean;
  account: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ExpenseCategoryCreate {
  name: string;
  code?: string;
  requires_client?: boolean;
  is_operating?: boolean;
  account?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface TransferPaymentLink {
  payment_id: string;
  amount: number;
  client_name?: string;
  client_phone?: string;
}

export interface ExpenseUpdate {
  status?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  receipt_url?: string;
}

export interface ExpenseListResponse {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
}

export interface BranchTransfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  amount: string | number;
  reason?: string;
  consultation_id?: string;
  payment_id?: string;
  payment_ids?: string[];
  pool?: string;
  method?: string;
  reference?: string;
  receipt_url?: string;
  status: 'initiated' | 'received' | 'cancelled';
  initiated_by?: string;
  initiated_at: string;
  received_by?: string;
  received_at?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  from_branch_name?: string;
  to_branch_name?: string;
  initiated_by_name?: string;
  payment_links?: TransferPaymentLink[];
  created_at: string;
  updated_at: string;
}

export interface BranchTransferCreate {
  from_branch_id: string;
  to_branch_id: string;
  amount: number;
  reason?: string;
  consultation_id?: string;
  payment_id?: string;
  payment_ids?: string[];
  pool?: string;
  method?: string;
  reference?: string;
  receipt_url?: string;
}

export interface BranchTransferListResponse {
  items: BranchTransfer[];
  total: number;
  page: number;
  page_size: number;
}

export interface TransferSummary {
  outgoing_initiated: number;
  outgoing_received: number;
  incoming_initiated: number;
  incoming_received: number;
  total_outgoing: number;
  total_incoming: number;
}

export interface TransferNotification {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  from_branch_name: string | null;
  to_branch_name: string | null;
  amount: string;
  reason?: string;
  consultation_id?: string;
  payment_id?: string;
  status: 'initiated' | 'received' | 'cancelled';
  direction: 'incoming' | 'outgoing';
  initiated_by?: string;
  initiated_at: string;
  created_at: string;
}

export interface TransferNotificationsResponse {
  items: TransferNotification[];
  total: number;
  to_receive_count: number;
  to_receive_amount: string;
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

export interface BranchCashPosition {
  branch_id: string;
  branch_name: string;
  pools: PoolPosition[];
}

export interface UnremittedClientPayment {
  payment_id: string;
  consultation_id: string;
  client_name: string;
  client_phone: string;
  amount: number;
  document_date?: string | null;
}

export interface HoFundingClient {
  consultation_id: string;
  client_name: string;
  client_phone: string;
  available_to_fund: number;
}

export interface HoFundingCreate {
  to_branch_id: string;
  items: { consultation_id: string; amount: number }[];
  method?: string;
  reference?: string;
  reason?: string;
}

export interface ProfitLossItem {
  branch_id: string;
  branch_name: string;
  revenue: number;
  expenses: number;
  commissions: number;
  net: number;
  payment_count: number;
}

export interface ProfitLossResponse {
  items: ProfitLossItem[];
  total_revenue: number;
  total_expenses: number;
  total_commissions: number;
  total_net: number;
}

export interface ExpenseCategoryListResponse {
  items: ExpenseCategory[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private base = '/api/v1/finance';

  constructor(private http: HttpClient) {}

  uploadReceipt(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/expenses/upload-receipt`, fd);
  }

  downloadExpenseReceipt(filename: string): Observable<Blob> {
    return this.http.get(`${this.base}/expenses/receipts/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
    });
  }

  listExpenses(params?: {
    branch_id?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Observable<ExpenseListResponse> {
    let p = new HttpParams();
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    if (params?.status) p = p.set('status', params.status);
    if (params?.page) p = p.set('page', params.page);
    if (params?.page_size) p = p.set('page_size', params.page_size);
    return this.http.get<ExpenseListResponse>(`${this.base}/expenses`, { params: p });
  }

  createExpense(data: ExpenseCreate): Observable<Expense> {
    return this.http.post<Expense>(`${this.base}/expenses`, data);
  }

  updateExpense(id: string, data: ExpenseUpdate): Observable<Expense> {
    return this.http.patch<Expense>(`${this.base}/expenses/${id}`, data);
  }

  approveExpense(id: string): Observable<Expense> {
    return this.http.post<Expense>(`${this.base}/expenses/${id}/approve`, {});
  }

  rejectExpense(id: string, reason: string): Observable<Expense> {
    return this.http.post<Expense>(`${this.base}/expenses/${id}/reject`, { rejection_reason: reason });
  }

  markExpensePaid(id: string): Observable<Expense> {
    return this.http.post<Expense>(`${this.base}/expenses/${id}/mark-paid`, {});
  }

  deleteExpense(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/expenses/${id}`);
  }

  getCollectionsSheet(params?: {
    period?: string;
    start_date?: string;
    end_date?: string;
    branch_id?: string;
  }): Observable<any[]> {
    let p = new HttpParams();
    if (params?.period) p = p.set('period', params.period);
    if (params?.start_date) p = p.set('start_date', params.start_date);
    if (params?.end_date) p = p.set('end_date', params.end_date);
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    return this.http.get<any[]>(`${this.base}/collections/sheet`, { params: p });
  }

  listTransfers(params?: {
    branch_id?: string;
    direction?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Observable<BranchTransferListResponse> {
    let p = new HttpParams();
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    if (params?.direction) p = p.set('direction', params.direction);
    if (params?.status) p = p.set('status', params.status);
    if (params?.page) p = p.set('page', params.page);
    if (params?.page_size) p = p.set('page_size', params.page_size);
    return this.http.get<BranchTransferListResponse>(`${this.base}/transfers`, { params: p });
  }

  createTransfer(data: BranchTransferCreate): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers`, data);
  }

  receiveTransfer(id: string, receiptUrl?: string): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers/${id}/receive`, { receipt_url: receiptUrl });
  }

  uploadTransferReceipt(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/transfers/upload-receipt`, fd);
  }

  cancelTransfer(id: string): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/transfers/${id}/cancel`, {});
  }

  getTransferSummary(params?: { branch_id?: string }): Observable<TransferSummary> {
    let p = new HttpParams();
    if (params?.branch_id) p = p.set('branch_id', params.branch_id);
    return this.http.get<TransferSummary>(`${this.base}/transfers/summary`, { params: p });
  }

  getTransferNotifications(limit = 20): Observable<TransferNotificationsResponse> {
    return this.http.get<TransferNotificationsResponse>(`${this.base}/transfers/notifications`, {
      params: new HttpParams().set('limit', limit),
    });
  }

  listExpenseCategories(params?: { active?: boolean }): Observable<ExpenseCategoryListResponse> {
    let p = new HttpParams();
    if (params?.active !== undefined) p = p.set('active', params.active ? 'true' : 'false');
    return this.http.get<ExpenseCategoryListResponse>(`${this.base}/expense-categories`, { params: p });
  }

  createExpenseCategory(data: ExpenseCategoryCreate): Observable<ExpenseCategory> {
    return this.http.post<ExpenseCategory>(`${this.base}/expense-categories`, data);
  }

  updateExpenseCategory(id: string, data: Partial<ExpenseCategoryCreate>): Observable<ExpenseCategory> {
    return this.http.patch<ExpenseCategory>(`${this.base}/expense-categories/${id}`, data);
  }

  deleteExpenseCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/expense-categories/${id}`);
  }

  syncUsedExpenseCategories(): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`${this.base}/expense-categories/sync-used`, {});
  }

  getCashPosition(): Observable<BranchCashPosition[]> {
    return this.http.get<BranchCashPosition[]>(`${this.base}/cash-position`);
  }

  getUnremittedClientPayments(branchId: string, search?: string): Observable<UnremittedClientPayment[]> {
    let p = new HttpParams().set('branch_id', branchId);
    if (search) p = p.set('search', search);
    return this.http.get<UnremittedClientPayment[]>(`${this.base}/cash-position/unremitted-client-payments`, { params: p });
  }

  getHoFundingClients(): Observable<HoFundingClient[]> {
    return this.http.get<HoFundingClient[]>(`${this.base}/cash-position/ho-funding-clients`);
  }

  createHoFunding(data: HoFundingCreate): Observable<BranchTransfer> {
    return this.http.post<BranchTransfer>(`${this.base}/ho-funding`, data);
  }

  getProfitLoss(params?: { from_date?: string; to_date?: string; branch_ids?: string[] }): Observable<ProfitLossResponse> {
    let p = new HttpParams();
    if (params?.from_date) p = p.set('from_date', params.from_date);
    if (params?.to_date) p = p.set('to_date', params.to_date);
    if (params?.branch_ids?.length) p = p.set('branch_ids', params.branch_ids.join(','));
    return this.http.get<ProfitLossResponse>(`${this.base}/profit-loss`, { params: p });
  }
}
