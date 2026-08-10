import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export type DashboardPeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month';

export const DASHBOARD_PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
];

export interface MobileDashboard {
  sales_today: number;
  sales_month: number;
  monthly_target: number;
  daily_collection_total: number;
  daily_collection_new: number;
  daily_collection_previous: number;
  pending_collections: number;
  commission_earned: number;
  commission_pending: number;
  today_training_sessions: number;
  month_training_sessions: number;
  days_trained: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getMobileDashboard(period: DashboardPeriod = 'today') {
    const params = new HttpParams().set('period', period);
    return this.http.get<MobileDashboard>('/api/v1/dashboard/mobile', { params });
  }
}
