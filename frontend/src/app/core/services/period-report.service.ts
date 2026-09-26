import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year';

export interface PeriodTotals {
  total_sales: number;
  sales_payments: number;
  total_collections: number;
  collection_payments: number;
  total_cash_received: number;
  old_client_collections: number;
  new_client_cash: number;
  old_client_share: number;
  consultations: number;
  conversions: number;
  converted_clients: number;
  conversion_rate: number;
  outstanding_total: number;
  outstanding_clients: number;
  expenses_filed: number;
  expenses_filed_count: number;
  expenses_paid: number;
  expenses_paid_count: number;
  expenses_pending_count: number;
  net_cash: number;
}

export interface PeriodGoal {
  target: number;
  attained: number;
  attainment_pct: number;
  remaining: number;
  status: string;
  source: string;
}

export interface ProductPerformance {
  product_id: string | null;
  package_id: string | null;
  product_name: string;
  package_name: string;
  amount: number;
  clients: number;
  payments: number;
}

export interface StaffPerformance {
  phone: string;
  name: string;
  role: string;
  sales: number;
  clients: number;
  collected: number;
  payment_clients: number;
}

export interface AtRiskClient {
  consultation_id: string;
  client_name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string;
  balance: number;
  last_payment_date: string | null;
  days_since_payment: number;
  consultation_date: string | null;
}

export interface PeriodReport {
  period: PeriodKind;
  period_label: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  branch_ids: string[];
  totals: PeriodTotals;
  goal: PeriodGoal;
  best_selling_products: ProductPerformance[];
  top_performers: StaffPerformance[];
  at_risk_clients: AtRiskClient[];
  at_risk_total: number;
  risk_days: number;
}

@Injectable({ providedIn: 'root' })
export class PeriodReportService {
  private http = inject(HttpClient);

  getReport(params: {
    period: PeriodKind;
    anchor?: string;
    branchIds?: string[];
    riskDays?: number;
    topN?: number;
  }): Observable<PeriodReport> {
    let httpParams = new HttpParams()
      .set('period', params.period)
      .set('risk_days', String(params.riskDays ?? 14))
      .set('top_n', String(params.topN ?? 10));
    if (params.anchor) httpParams = httpParams.set('anchor', params.anchor);
    if (params.branchIds?.length) {
      httpParams = httpParams.set('branch_ids', params.branchIds.join(','));
    }
    return this.http.get<PeriodReport>('/api/v1/reports/period', { params: httpParams });
  }
}
