import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface Expense {
  id: string;
  branch_id: string;
  amount: number;
  description: string | null;
  category: string | null;
  mileage: number | null;
  vehicle_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  receipt_url: string | null;
  expense_date: string;
  created_by_phone: string | null;
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
  description?: string;
  category?: string;
  mileage?: number;
  vehicle_id?: string;
  expense_date?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  constructor(private http: HttpClient) {}

  getExpenses(params?: {
    branch_id?: string | null;
    status?: string | null;
    category?: string | null;
    category_not?: string | null;
    page?: number;
    page_size?: number;
  }) {
    let httpParams = new HttpParams();
    if (params?.branch_id) httpParams = httpParams.set('branch_id', params.branch_id);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.category_not) httpParams = httpParams.set('category_not', params.category_not);
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.page_size != null) httpParams = httpParams.set('page_size', String(params.page_size));
    return this.http.get<ExpenseListResponse>('/api/v1/finance/expenses', { params: httpParams });
  }

  createExpense(payload: ExpenseCreatePayload) {
    return this.http.post<Expense>('/api/v1/finance/expenses', payload);
  }

  approveExpense(id: string) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/approve`, {});
  }

  rejectExpense(id: string, rejection_reason: string) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/reject`, { rejection_reason });
  }

  markPaid(id: string) {
    return this.http.post<Expense>(`/api/v1/finance/expenses/${id}/mark-paid`, {});
  }

  deleteExpense(id: string) {
    return this.http.delete<void>(`/api/v1/finance/expenses/${id}`);
  }

  uploadReceipt(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>('/api/v1/finance/expenses/upload-receipt', formData);
  }
}
