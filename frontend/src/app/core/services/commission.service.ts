import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CommissionRate {
  id: string;
  company_id: string;
  name: string;
  amount: number;
  lesson_type: string | null;
  transmission_type: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  company_id: string;
  instructor_id: string;
  client_lesson_id: string | null;
  training_session_id: string | null;
  commission_rate_id: string | null;
  amount: number;
  status: string;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  instructor_name: string | null;
  client_name: string | null;
  lesson_title: string | null;
}

export interface CommissionListResponse {
  items: Commission[];
  total: number;
  page: number;
  page_size: number;
}

export interface CommissionReportItem {
  instructor_id: string;
  instructor_name: string | null;
  total_commissions: number;
  total_count: number;
  paid_count: number;
  pending_count: number;
  paid_amount: number;
  pending_amount: number;
}

export interface CommissionReportResponse {
  items: CommissionReportItem[];
  grand_total: number;
  grand_paid: number;
  grand_pending: number;
}

@Injectable({ providedIn: 'root' })
export class CommissionService {
  constructor(private http: HttpClient) {}

  listRates(): Observable<CommissionRate[]> {
    return this.http.get<CommissionRate[]>('/api/v1/commission/rates');
  }

  createRate(data: Partial<CommissionRate>): Observable<CommissionRate> {
    return this.http.post<CommissionRate>('/api/v1/commission/rates', data);
  }

  updateRate(id: string, data: Partial<CommissionRate>): Observable<CommissionRate> {
    return this.http.patch<CommissionRate>(`/api/v1/commission/rates/${id}`, data);
  }

  deleteRate(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/commission/rates/${id}`);
  }

  list(params?: { instructor_id?: string; status?: string; page?: number; page_size?: number }): Observable<CommissionListResponse> {
    return this.http.get<CommissionListResponse>('/api/v1/commission', { params: params as any });
  }

  create(data: Partial<Commission>): Observable<Commission> {
    return this.http.post<Commission>('/api/v1/commission', data);
  }

  update(id: string, data: Partial<Commission>): Observable<Commission> {
    return this.http.patch<Commission>(`/api/v1/commission/${id}`, data);
  }

  getReport(params?: { instructor_id?: string; date_from?: string; date_to?: string }): Observable<CommissionReportResponse> {
    return this.http.get<CommissionReportResponse>('/api/v1/commission/report', { params: params as any });
  }
}
