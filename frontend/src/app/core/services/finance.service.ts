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
  expense_date?: string | Date;
  status?: string;
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

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private base = '/api/v1/finance';

  constructor(private http: HttpClient) {}

  uploadReceipt(file: File): Observable<{ url: string }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/expenses/upload-receipt`, fd);
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
}
