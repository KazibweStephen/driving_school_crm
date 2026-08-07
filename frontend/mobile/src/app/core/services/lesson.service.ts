import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface ClientLesson {
  id: string;
  lesson_plan_id: string;
  day_number: number | null;
  week_number: number | null;
  title: string;
  status: string;
  is_locked: boolean;
  difficulty: string | null;
  outcome: string | null;
  instructor_id: string | null;
  vehicle_id: string | null;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

export interface LessonTimer {
  id: string;
  client_lesson_id: string;
  started_at: string | null;
  started_by: string | null;
  paused_at: string | null;
  total_seconds: number;
  distance_km: number | null;
  elapsed_minutes: number;
  status: string;
}

export interface TimerSync {
  total_seconds: number;
  distance_km?: number;
}

@Injectable({ providedIn: 'root' })
export class LessonService {
  constructor(private http: HttpClient) {}

  startLesson(lessonId: string) {
    return this.http.post<ClientLesson>(`/api/v1/lesson-plans/lessons/${lessonId}/start`, {});
  }

  completeLesson(lessonId: string, outcome?: string, notes?: string) {
    let params = new HttpParams();
    if (outcome) params = params.set('outcome', outcome);
    if (notes) params = params.set('notes', notes);
    return this.http.post<ClientLesson>(
      `/api/v1/lesson-plans/lessons/${lessonId}/complete`,
      {},
      { params },
    );
  }

  startTimer(lessonId: string) {
    return this.http.post<LessonTimer>(`/api/v1/lessons/${lessonId}/timer/start`, {});
  }

  pauseTimer(lessonId: string) {
    return this.http.post<LessonTimer>(`/api/v1/lessons/${lessonId}/timer/pause`, {});
  }

  resumeTimer(lessonId: string) {
    return this.http.post<LessonTimer>(`/api/v1/lessons/${lessonId}/timer/resume`, {});
  }

  syncTimer(lessonId: string, data: TimerSync) {
    return this.http.put<LessonTimer>(`/api/v1/lessons/${lessonId}/timer/sync`, data);
  }

  getTimer(lessonId: string) {
    return this.http.get<LessonTimer>(`/api/v1/lessons/${lessonId}/timer`);
  }
}
