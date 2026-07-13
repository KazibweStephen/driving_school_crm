import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FuelRate {
  id: string;
  company_id: string;
  vehicle_id: string;
  rate_per_lesson: number;
  is_active: boolean;
  effective_from: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle_name: string | null;
  vehicle_plate: string | null;
}

export interface FuelRefueling {
  id: string;
  company_id: string;
  vehicle_id: string;
  fuel_rate_id: string;
  amount: number;
  liters: number | null;
  lessons_covered: number;
  refueled_at: string;
  odometer_reading: number | null;
  notes: string | null;
  created_at: string;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  rate_per_lesson: number | null;
  remaining_lessons: number | null;
}

export interface FuelRefuelingListResponse {
  items: FuelRefueling[];
  total: number;
  page: number;
  page_size: number;
}

export interface FuelAlert {
  vehicle_id: string;
  vehicle_name: string;
  vehicle_plate: string;
  remaining_lessons: number;
  last_refueling_id: string;
  last_refueling_date: string;
  lessons_covered: number;
}

export interface FuelVehicleStatus {
  last_refueling_id: string;
  last_refueling_amount: number;
  lessons_covered: number;
  completed_lessons: number;
  remaining_lessons: number;
  rate_per_lesson: number | null;
  needs_refueling: boolean;
}

export interface FuelReportItem {
  vehicle_id: string;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  total_refuelings: number;
  total_amount: number;
  total_liters: number | null;
  total_lessons_covered: number;
}

export interface FuelReportResponse {
  items: FuelReportItem[];
  grand_total: number;
  grand_liters: number | null;
  grand_lessons_covered: number;
}

@Injectable({ providedIn: 'root' })
export class FuelService {
  constructor(private http: HttpClient) {}

  listRates(params?: { vehicle_id?: string; active_only?: boolean }): Observable<FuelRate[]> {
    let p = new HttpParams();
    if (params?.vehicle_id) p = p.set('vehicle_id', params.vehicle_id);
    if (params?.active_only) p = p.set('active_only', 'true');
    return this.http.get<FuelRate[]>('/api/v1/fuel/rates', { params: p });
  }

  getActiveRate(vehicle_id: string): Observable<FuelRate> {
    return this.http.get<FuelRate>('/api/v1/fuel/rates/active', { params: { vehicle_id } });
  }

  createRate(data: Partial<FuelRate>): Observable<FuelRate> {
    return this.http.post<FuelRate>('/api/v1/fuel/rates', data);
  }

  updateRate(id: string, data: Partial<FuelRate>): Observable<FuelRate> {
    return this.http.patch<FuelRate>(`/api/v1/fuel/rates/${id}`, data);
  }

  deleteRate(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/fuel/rates/${id}`);
  }

  listRefuelings(params?: { vehicle_id?: string; page?: number; page_size?: number }): Observable<FuelRefuelingListResponse> {
    let p = new HttpParams();
    if (params?.vehicle_id) p = p.set('vehicle_id', params.vehicle_id);
    if (params?.page) p = p.set('page', params.page);
    if (params?.page_size) p = p.set('page_size', params.page_size);
    return this.http.get<FuelRefuelingListResponse>('/api/v1/fuel/refuelings', { params: p });
  }

  createRefueling(data: Partial<FuelRefueling>): Observable<FuelRefueling> {
    return this.http.post<FuelRefueling>('/api/v1/fuel/refuelings', data);
  }

  deleteRefueling(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/fuel/refuelings/${id}`);
  }

  getAlerts(): Observable<FuelAlert[]> {
    return this.http.get<FuelAlert[]>('/api/v1/fuel/alerts');
  }

  getVehicleStatus(vehicle_id: string): Observable<FuelVehicleStatus> {
    return this.http.get<FuelVehicleStatus>(`/api/v1/fuel/status/${vehicle_id}`);
  }

  getReport(params?: { vehicle_id?: string; date_from?: string; date_to?: string }): Observable<FuelReportResponse> {
    let p = new HttpParams();
    if (params?.vehicle_id) p = p.set('vehicle_id', params.vehicle_id);
    if (params?.date_from) p = p.set('date_from', params.date_from);
    if (params?.date_to) p = p.set('date_to', params.date_to);
    return this.http.get<FuelReportResponse>('/api/v1/fuel/report', { params: p });
  }
}
