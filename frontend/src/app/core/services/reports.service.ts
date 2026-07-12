import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FuelAlert } from './fuel.service';

export interface DashboardSummary {
  total_revenue_today: number;
  total_revenue_month: number;
  total_expenses_month: number;
  total_commissions_month: number;
  active_clients: number;
  pending_follow_ups: number;
  pending_commissions: number;
  fuel_alerts: FuelAlert[];
  upcoming_lessons_today: number;
  ongoing_lessons: number;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private http: HttpClient) {}

  getDashboard(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>('/api/v1/reports/dashboard');
  }
}
