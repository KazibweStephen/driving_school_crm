import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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

  getMobileDashboard() {
    return this.http.get<MobileDashboard>('/api/v1/dashboard/mobile');
  }
}
