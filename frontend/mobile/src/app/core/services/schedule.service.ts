import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface WeeklyScheduleEntry {
  lesson_id: string;
  client_name: string;
  title: string;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number;
  instructor_id: string | null;
  instructor_name: string | null;
  vehicle_id: string | null;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  transmission: string | null;
  status: string;
}

export interface WeeklyScheduleResponse {
  start_date: string;
  days: string[];
  slots: WeeklyScheduleEntry[];
}

export interface FindAndLockRequest {
  instructor_id: string;
  vehicle_id?: string;
  start_date: string;
  preferred_times: string[];
  instructor_id_auto?: string;
  vehicle_id_auto?: string;
  manual_days?: number;
}

export interface FindAndLockResult {
  locked: boolean;
  start_time?: string;
  end_time?: string;
  lessons_locked?: number;
  message?: string;
}

export interface ClientLessonPlan {
  id: string;
  cart_item_id: string;
  template_id: string | null;
  transmission_type: string;
  start_date: string | null;
  status: string;
  purchased_days: number | null;
  auto_generated: boolean;
  template_type: string | null;
  manual_days: number | null;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  constructor(private http: HttpClient) {}

  getWeeklySchedule(startDate: string, view: string = 'week', applyInstructorScope = false) {
    const params = new HttpParams()
      .set('start_date', startDate)
      .set('view', view)
      .set('apply_instructor_scope', String(applyInstructorScope));
    return this.http.get<WeeklyScheduleResponse>('/api/v1/schedule/weekly', { params });
  }

  generatePlan(
    cartItemId: string,
    templateId: string,
    transmissionType: string,
    startDate: string,
    purchasedDays: number,
  ) {
    const params = new HttpParams()
      .set('template_id', templateId)
      .set('transmission_type', transmissionType)
      .set('start_date', startDate)
      .set('purchased_days', purchasedDays);
    return this.http.post<ClientLessonPlan>(
      `/api/v1/cart-items/${cartItemId}/lesson-plans/generate`,
      {},
      { params },
    );
  }

  findAndLock(planId: string, data: FindAndLockRequest) {
    return this.http.post<FindAndLockResult>(`/api/v1/lesson-plans/${planId}/find-and-lock`, data);
  }

  listClientPlans(cartItemId: string) {
    return this.http.get<ClientLessonPlan[]>(`/api/v1/cart-items/${cartItemId}/lesson-plans`);
  }
}
