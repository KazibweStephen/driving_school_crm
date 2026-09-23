import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Expense {
  id: string;
  branch_id: string;
  branch_name?: string | null;
  amount: number;
  charges: number;
  paid_charges?: number | null;
  description: string | null;
  category: string | null;
  mileage: number | null;
  vehicle_id: string | null;
  vehicle_name?: string | null;
  vehicle_plate_number?: string | null;
  instructor_id: string | null;
  instructor_name?: string | null;
  consultation_id: string | null;
  cart_item_id: string | null;
  client_name?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  receipt_url: string | null;
  expense_date: string;
  created_by_phone: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  paid_by_name: string | null;
  created_at: string;
}

export interface ExpenseListResponse {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
}

export interface ExpenseCreatePayload {
  branch_id: string;
  amount: number;
  charges?: number;
  description?: string;
  category?: string;
  mileage?: number;
  vehicle_id?: string;
  instructor_id?: string;
  consultation_id?: string;
  cart_item_id?: string;
  expense_date?: string;
  status?: string;
  receipt_url?: string;
}

export interface ExpenseUpdatePayload {
  category?: string;
  consultation_id?: string;
  amount?: number;
  charges?: number;
  description?: string;
  mileage?: number | null;
  vehicle_id?: string;
  instructor_id?: string;
}

export interface ClientAccountPool {
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
  pools: ClientAccountPool[];
}

export interface UnremittedClientPayment {
  payment_id: string;
  consultation_id: string;
  client_name: string;
  client_phone: string;
  total_paid?: number;
  unremitted?: number;
  funded?: number;
  amount: number;
  document_date?: string | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  requires_client: boolean;
  requires_user: boolean;
  requires_vehicle: boolean;
  is_operating: boolean;
  account: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  constructor(private http: HttpClient) {}

  getExpenses(params?: {
    branch_id?: string | null;
    status?: string | null;
    category?: string | null;
    category_not?: string | null;
    consultation_id?: string | null;
    cart_item_id?: string | null;
    date_from?: string | null;
    date_to?: string | null;
    page?: number;
    page_size?: number;
  }) {
    let httpParams = new HttpParams();
    if (params?.branch_id) httpParams = httpParams.set('branch_id', params.branch_id);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.category_not) httpParams = httpParams.set('category_not', params.category_not);
    if (params?.consultation_id) httpParams = httpParams.set('consultation_id', params.consultation_id);
    if (params?.cart_item_id) httpParams = httpParams.set('cart_item_id', params.cart_item_id);
    if (params?.date_from) httpParams = httpParams.set('date_from', params.date_from);
    if (params?.date_to) httpParams = httpParams.set('date_to', params.date_to);
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.page_size != null) httpParams = httpParams.set('page_size', String(params.page_size));
    return this.http.get<ExpenseListResponse>('/api/v1/finance/expenses', { params: httpParams });
  }

  createExpense(payload: ExpenseCreatePayload) {
    return this.http.post<Expense>('/api/v1/finance/expenses', payload);
  }

  updateExpense(id: string, data: ExpenseUpdatePayload) {
    return this.http.patch<Expense>(`/api/v1/finance/expenses/${id}`, data);
  }

  approveExpense(id: string, body?: { approved_at?: string }) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/approve`, body ?? {});
  }

  rejectExpense(id: string, rejection_reason: string) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/reject`, { rejection_reason });
  }

  markPaid(id: string, body?: { charges?: number; receipt_url?: string; paid_at?: string }) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/mark-paid`, body ?? {});
  }

  updateExpenseDates(id: string, body: { expense_date?: string; approved_at?: string; paid_at?: string }) {
    return this.http.patch<Expense>(`/api/v1/finance/expenses/${id}/dates`, body);
  }

  deleteExpense(id: string) {
    return this.http.delete<void>(`/api/v1/finance/expenses/${id}`);
  }

  uploadReceipt(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>('/api/v1/finance/expenses/upload-receipt', formData);
  }

  downloadReceipt(filename: string) {
    return this.http.get(`/api/v1/finance/expenses/receipts/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
    });
  }

  getClientAccountAvailable(branchId: string): Observable<number> {
    return this.http
      .get<BranchCashPosition[]>('/api/v1/finance/cash-position', { params: { branch_id: branchId } })
      .pipe(
        map(
          (positions) =>
            positions
              .find((b) => b.branch_id === branchId)
              ?.pools?.find((p) => p.pool === 'client_accounts')?.net_in_hand ?? 0,
        ),
      );
  }

  getUnremittedClientPayments(branchId: string): Observable<UnremittedClientPayment[]> {
    return this.http.get<UnremittedClientPayment[]>('/api/v1/finance/cash-position/unremitted-client-payments', {
      params: { branch_id: branchId },
    });
  }

  listExpenseCategories(): Observable<{ items: ExpenseCategory[] }> {
    return this.http.get<{ items: ExpenseCategory[] }>('/api/v1/finance/expense-categories');
  }
}
