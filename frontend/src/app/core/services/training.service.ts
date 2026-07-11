import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface Skill {
  id: string;
  training_session_id: string;
  name: string;
  description: string | null;
  competency_level: number;
  achieved: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface SkillCreate {
  name: string;
  description?: string | null;
  competency_level?: number;
  order?: number;
}

export interface SkillUpdate {
  name?: string;
  description?: string | null;
  competency_level?: number;
  achieved?: boolean;
  order?: number;
}

export interface TrainingSession {
  id: string;
  cart_item_id: string;
  session_date: string;
  duration_minutes: number;
  theory_minutes: number | null;
  driving_minutes: number | null;
  notes: string | null;
  instructor_notes: string | null;
  lesson_plan_id: string | null;
  video_url: string | null;
  video_cached: boolean;
  video_invalidated: boolean;
  started_at: string | null;
  started_by: string | null;
  timer_seconds: number | null;
  timer_started_at: string | null;
  skills: Skill[];
  created_at: string;
  updated_at: string;
}

export interface TrainingSessionCreate {
  session_date: string;
  duration_minutes?: number;
  theory_minutes?: number | null;
  driving_minutes?: number | null;
  notes?: string | null;
  instructor_notes?: string | null;
  video_url?: string | null;
  skills?: SkillCreate[];
}

export interface TrainingSessionUpdate {
  session_date?: string;
  duration_minutes?: number;
  theory_minutes?: number | null;
  driving_minutes?: number | null;
  notes?: string | null;
  instructor_notes?: string | null;
  video_url?: string | null;
}

export interface GenerateSessionsRequest {
  start_date: string;
  driving_per_session_minutes?: number;
  theory_per_session_minutes?: number;
}

export interface TrainingSummary {
  total_driving_minutes: number;
  total_theory_minutes: number;
  sessions_count: number;
  expected_driving_minutes: number | null;
  expected_theory_minutes: number | null;
  driving_remaining_minutes: number | null;
  theory_remaining_minutes: number | null;
}

@Injectable({ providedIn: 'root' })
export class TrainingService {
  constructor(private http: HttpClient) {}

  listByCartItem(cartItemId: string) {
    return this.http.get<TrainingSession[]>(`/api/v1/cart-items/${cartItemId}/training-sessions`);
  }

  create(cartItemId: string, data: TrainingSessionCreate) {
    return this.http.post<TrainingSession>(`/api/v1/cart-items/${cartItemId}/training-sessions`, data);
  }

  generate(cartItemId: string, data: GenerateSessionsRequest) {
    return this.http.post<TrainingSession[]>(`/api/v1/cart-items/${cartItemId}/training-sessions/generate`, data);
  }

  update(sessionId: string, data: TrainingSessionUpdate) {
    return this.http.patch<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}`, data);
  }

  remove(sessionId: string) {
    return this.http.delete(`/api/v1/cart-items/training-sessions/${sessionId}`);
  }

  getSummary(cartItemId: string) {
    return this.http.get<TrainingSummary>(`/api/v1/cart-items/${cartItemId}/training-summary`);
  }

  startSession(sessionId: string) {
    return this.http.post<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}/start`, {});
  }

  endSession(sessionId: string, instructorNotes?: string) {
    return this.http.post<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}/end`, { instructor_notes: instructorNotes || null });
  }

  updateTimer(sessionId: string, timerSeconds: number) {
    return this.http.patch<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}/timer?timer_seconds=${timerSeconds}`, {});
  }

  cacheVideo(sessionId: string) {
    return this.http.post<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}/video/cache`, {});
  }

  invalidateVideo(sessionId: string) {
    return this.http.post<TrainingSession>(`/api/v1/cart-items/training-sessions/${sessionId}/video/invalidate`, {});
  }

  getDailySchedule(date?: string, branchId?: string, extra?: { period?: string; start_date?: string; end_date?: string }) {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    if (branchId) params = params.set('branch_id', branchId);
    if (extra?.period) params = params.set('period', extra.period);
    if (extra?.start_date) params = params.set('start_date', extra.start_date);
    if (extra?.end_date) params = params.set('end_date', extra.end_date);
    return this.http.get<any[]>('/api/v1/training/daily-schedule', { params });
  }

  // Skill CRUD
  listSkills(sessionId: string) {
    return this.http.get<Skill[]>(`/api/v1/cart-items/training-sessions/${sessionId}/skills`);
  }

  createSkill(sessionId: string, data: SkillCreate) {
    return this.http.post<Skill>(`/api/v1/cart-items/training-sessions/${sessionId}/skills`, data);
  }

  updateSkill(skillId: string, data: SkillUpdate) {
    return this.http.patch<Skill>(`/api/v1/cart-items/training-sessions/skills/${skillId}`, data);
  }

  deleteSkill(skillId: string) {
    return this.http.delete(`/api/v1/cart-items/training-sessions/skills/${skillId}`);
  }
}
