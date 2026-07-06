import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface VehicleScheduleSlot {
  id: string;
  vehicle_id: string;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleScheduleSlotCreate {
  vehicle_id: string;
  instructor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

@Injectable({ providedIn: 'root' })
export class VehicleScheduleService {
  constructor(private http: HttpClient) {}

  list(params?: { vehicle_id?: string; instructor_id?: string; day_of_week?: number }) {
    let p = new HttpParams();
    if (params?.vehicle_id) p = p.set('vehicle_id', params.vehicle_id);
    if (params?.instructor_id) p = p.set('instructor_id', params.instructor_id);
    if (params?.day_of_week !== undefined) p = p.set('day_of_week', params.day_of_week);
    return this.http.get<VehicleScheduleSlot[]>('/api/v1/vehicle-schedule', { params: p });
  }

  get(id: string) {
    return this.http.get<VehicleScheduleSlot>(`/api/v1/vehicle-schedule/${id}`);
  }

  create(data: VehicleScheduleSlotCreate) {
    return this.http.post<VehicleScheduleSlot>('/api/v1/vehicle-schedule', data);
  }

  update(id: string, data: { instructor_id?: string; start_time?: string; end_time?: string }) {
    return this.http.patch<VehicleScheduleSlot>(`/api/v1/vehicle-schedule/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/v1/vehicle-schedule/${id}`);
  }

  bulkSet(vehicleId: string, slots: VehicleScheduleSlotCreate[]) {
    return this.http.put<VehicleScheduleSlot[]>(`/api/v1/vehicle-schedule/${vehicleId}/bulk`, slots);
  }

  resolveInstructor(vehicleId: string, dayOfWeek: number, atTime: string) {
    const params = new HttpParams()
      .set('day_of_week', dayOfWeek)
      .set('at_time', atTime);
    return this.http.get<{ instructor_id: string | null }>(
      `/api/v1/vehicle-schedule/${vehicleId}/resolve-instructor`,
      { params }
    );
  }
}
