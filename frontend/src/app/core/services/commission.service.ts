import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CommissionRate {
  id: string;
  company_id: string;
  package_ids: string[];
  total_amount: number;
  converter_pct: number;
  primary_recommender_pct: number;
  secondary_recommender_pct: number;
  active_from: string;
  active_until: string | null;
  deactivated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  package_names: string[];
}

export interface Commission {
  id: string;
  company_id: string;
  cart_item_id: string;
  commission_rate_id: string | null;
  converter_id: string | null;
  primary_recommender_id: string | null;
  secondary_recommender_id: string | null;
  total_amount: number;
  converter_amount: number;
  primary_recommender_amount: number;
  secondary_recommender_amount: number;
  status: string;
  contest_status: string | null;
  notes: string | null;
  created_at: string;
  maturity: CommissionMaturity | null;
  converter_name: string | null;
  primary_recommender_name: string | null;
  secondary_recommender_name: string | null;
  client_name: string | null;
  package_name: string | null;
}

export interface CommissionListResponse {
  items: Commission[];
  total: number;
  page: number;
  page_size: number;
}

export interface CommissionMaturity {
  maturity_pct: number;
  matured_converter_amount: number;
  matured_primary_amount: number;
  matured_secondary_amount: number;
  remaining_converter_amount: number;
  remaining_primary_amount: number;
  remaining_secondary_amount: number;
}

export interface CommissionSummaryItem {
  commission_id: string;
  client_name: string;
  package_name: string;
  total_amount: number;
  converter_amount: number;
  primary_recommender_amount: number;
  secondary_recommender_amount: number;
  maturity_pct: number;
  matured_converter_amount: number;
  matured_primary_amount: number;
  matured_secondary_amount: number;
  remaining_converter_amount: number;
  remaining_primary_amount: number;
  remaining_secondary_amount: number;
  user_role: string;
  user_share_total: number;
  user_share_matured: number;
  user_share_remaining: number;
  converter_name: string | null;
  primary_recommender_name: string | null;
  secondary_recommender_name: string | null;
}

export interface CommissionSummaryResponse {
  items: CommissionSummaryItem[];
  total_commission: number;
  total_matured: number;
  total_remaining: number;
}

export interface Contest {
  id: string;
  commission_id: string;
  contested_by_id: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolved_by_id: string | null;
  created_at: string;
  resolved_at: string | null;
  contested_by_name: string | null;
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

  list(params?: { status?: string; page?: number; page_size?: number }): Observable<CommissionListResponse> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    if (params?.page) p = p.set('page', params.page);
    if (params?.page_size) p = p.set('page_size', params.page_size);
    return this.http.get<CommissionListResponse>('/api/v1/commission', { params: p });
  }

  update(id: string, data: Partial<Commission>): Observable<Commission> {
    return this.http.patch<Commission>(`/api/v1/commission/commissions/${id}`, data);
  }

  getSummary(): Observable<CommissionSummaryResponse> {
    return this.http.get<CommissionSummaryResponse>('/api/v1/commission/my-dashboard/summary');
  }
}
