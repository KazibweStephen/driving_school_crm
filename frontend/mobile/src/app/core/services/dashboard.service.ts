import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface MobileDashboard {
  daily_sales: number;
  monthly_sales: number;
  monthly_target: number;
  pending_collections: number;
  commission_earned: number;
  commission_pending: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getMobileDashboard() {
    return this.http.get<MobileDashboard>('/api/v1/dashboard/mobile');
  }
}
