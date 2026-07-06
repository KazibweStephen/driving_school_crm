import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface ClientAvailability {
  id: string;
  cart_item_id: string;
  day_of_week: number;
  start_time: string;
  created_at: string;
  updated_at: string;
}

export interface ClientAvailabilityCreate {
  cart_item_id: string;
  day_of_week: number;
  start_time: string;
}

export interface ClientAvailabilityUpdate {
  day_of_week?: number;
  start_time?: string;
}

export interface ScheduleSlot {
  lesson_id: string;
  client_name: string;
  title: string;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number;
  instructor_id: string | null;
  vehicle_id: string | null;
  transmission: string | null;
  status: string;
}

export interface InstructorScheduleDay {
  date: string;
  slots: ScheduleSlot[];
  collisions: { time_slot: string; lessons: any[]; count: number }[];
}

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
  schedule?: InstructorScheduleDay & { all_slots?: { start_time: string; end_time: string; busy: boolean }[] };
  message?: string;
}

export interface LockScheduleRequest {
  start_time: string;
  instructor_id?: string;
  vehicle_id?: string;
  start_date?: string;
  instructor_id_auto?: string;
  vehicle_id_auto?: string;
  manual_days?: number;
}

@Injectable({ providedIn: 'root' })
export class SchedulingService {
  constructor(private http: HttpClient) {}

  // ── Client Availabilities ──

  createAvailability(data: ClientAvailabilityCreate) {
    return this.http.post<ClientAvailability>('/api/v1/availabilities', data);
  }

  listAvailabilities(cartItemId: string) {
    return this.http.get<ClientAvailability[]>(`/api/v1/cart-items/${cartItemId}/availabilities`);
  }

  updateAvailability(availId: string, data: ClientAvailabilityUpdate) {
    return this.http.patch<ClientAvailability>(`/api/v1/availabilities/${availId}`, data);
  }

  deleteAvailability(availId: string) {
    return this.http.delete(`/api/v1/availabilities/${availId}`);
  }

  // ── Schedule ──

  getInstructorSchedule(instructorId: string, onDate: string) {
    const params = new HttpParams().set('on_date', onDate);
    return this.http.get<InstructorScheduleDay>(
      `/api/v1/instructors/${instructorId}/schedule`,
      { params }
    );
  }

  findAndLock(planId: string, data: FindAndLockRequest) {
    return this.http.post<FindAndLockResult>(
      `/api/v1/lesson-plans/${planId}/find-and-lock`,
      data
    );
  }

  lockSchedule(planId: string, data: LockScheduleRequest) {
    return this.http.post<{ locked: number; message: string }>(
      `/api/v1/lesson-plans/${planId}/lock-schedule`,
      data
    );
  }

  getWeeklySchedule(startDate: string) {
    const params = new HttpParams().set('start_date', startDate);
    return this.http.get<WeeklyScheduleResponse>(
      `/api/v1/schedule/weekly`,
      { params }
    );
  }

  findAvailableSlot(instructorId: string, onDate: string, preferredTimes: string[]) {
    const params = new HttpParams()
      .set('on_date', onDate)
      .set('preferred_times', preferredTimes.join(','));
    return this.http.get<any>(
      `/api/v1/instructors/${instructorId}/find-slot`,
      { params }
    );
  }
}
