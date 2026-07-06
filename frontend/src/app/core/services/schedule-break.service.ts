import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ScheduleBreak {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_standard: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleBreakCreate {
  name: string;
  start_time: string;
  end_time: string;
  is_active?: boolean;
  is_standard?: boolean;
}

export interface ScheduleBreakUpdate {
  name?: string;
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
  is_standard?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ScheduleBreakService {
  constructor(private http: HttpClient) {}

  list(activeOnly?: boolean) {
    const params: any = {};
    if (activeOnly) params.active_only = 'true';
    return this.http.get<ScheduleBreak[]>('/api/v1/schedule-breaks', { params });
  }

  create(data: ScheduleBreakCreate) {
    return this.http.post<ScheduleBreak>('/api/v1/schedule-breaks', data);
  }

  update(id: string, data: ScheduleBreakUpdate) {
    return this.http.patch<ScheduleBreak>(`/api/v1/schedule-breaks/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/v1/schedule-breaks/${id}`);
  }
}
