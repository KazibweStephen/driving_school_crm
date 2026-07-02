import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ChecklistItem {
  id: string;
  client_lesson_id: string;
  checklist_type: string;
  item_label: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemCreate {
  checklist_type: string;
  item_label: string;
  order?: number;
}

export interface ChecklistItemUpdate {
  item_label?: string;
  is_checked?: boolean;
  order?: number;
}

export interface Competency {
  id: string;
  client_lesson_id: string;
  competency_name: string;
  level: string;
  notes: string | null;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CompetencyCreate {
  competency_name: string;
  level?: string;
  notes?: string;
  order?: number;
}

export interface CompetencyUpdate {
  level?: string;
  notes?: string;
  order?: number;
}

export interface LessonTimer {
  id: string;
  client_lesson_id: string;
  started_at: string | null;
  started_by: string | null;
  paused_at: string | null;
  paused_by: string | null;
  total_seconds: number;
  distance_km: number;
  elapsed_minutes: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TimerSync {
  total_seconds: number;
  distance_km?: number;
}

export interface TheorySession {
  id: string;
  lesson_plan_id: string;
  week_number: number;
  session_date: string;
  duration_minutes: number;
  topic: string | null;
  video_ids: string[];
  slides_url: string | null;
  quiz_data: any[];
  attendance_list: any[];
  instructor_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TheorySessionCreate {
  week_number: number;
  session_date: string;
  duration_minutes?: number;
  topic?: string;
  video_ids?: string[];
  slides_url?: string;
  quiz_data?: any[];
  instructor_id?: string;
}

export interface TheorySessionUpdate {
  session_date?: string;
  duration_minutes?: number;
  topic?: string;
  video_ids?: string[];
  slides_url?: string;
  quiz_data?: any[];
  attendance_list?: any[];
  instructor_id?: string;
  status?: string;
  notes?: string;
}

export interface TheorySessionGenerateRequest {
  start_date: string;
  total_weeks?: number;
  session_duration_minutes?: number;
}

export interface CompetencyDashboardResponse {
  competencies: any[];
  overall_summary: {
    total_competencies: number;
    total_ratings: number;
    mastered_count: number;
    competent_count: number;
    progress_pct: number;
  };
}

@Injectable({ providedIn: 'root' })
export class LessonExecutionService {
  constructor(private http: HttpClient) {}

  // ── Checklists ──
  listChecklists(lessonId: string, checklistType?: string) {
    let params: any = {};
    if (checklistType) params.checklist_type = checklistType;
    return this.http.get<ChecklistItem[]>(`/api/v1/lessons/${lessonId}/checklists`, { params });
  }

  createChecklistItem(lessonId: string, data: ChecklistItemCreate) {
    return this.http.post<ChecklistItem>(`/api/v1/lessons/${lessonId}/checklists`, data);
  }

  updateChecklistItem(itemId: string, data: ChecklistItemUpdate) {
    return this.http.patch<ChecklistItem>(`/api/v1/lessons/checklists/${itemId}`, data);
  }

  deleteChecklistItem(itemId: string) {
    return this.http.delete(`/api/v1/lessons/checklists/${itemId}`);
  }

  // ── Competencies ──
  listCompetencies(lessonId: string) {
    return this.http.get<Competency[]>(`/api/v1/lessons/${lessonId}/competencies`);
  }

  createCompetency(lessonId: string, data: CompetencyCreate) {
    return this.http.post<Competency>(`/api/v1/lessons/${lessonId}/competencies`, data);
  }

  updateCompetency(competencyId: string, data: CompetencyUpdate) {
    return this.http.patch<Competency>(`/api/v1/lessons/competencies/${competencyId}`, data);
  }

  deleteCompetency(competencyId: string) {
    return this.http.delete(`/api/v1/lessons/competencies/${competencyId}`);
  }

  // ── Timer ──
  getTimer(lessonId: string) {
    return this.http.get<LessonTimer>(`/api/v1/lessons/${lessonId}/timer`);
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

  // ── Theory Sessions ──
  listTheorySessions(planId: string) {
    return this.http.get<TheorySession[]>(`/api/v1/lesson-plans/${planId}/theory`);
  }

  createTheorySession(planId: string, data: TheorySessionCreate) {
    return this.http.post<TheorySession>(`/api/v1/lesson-plans/${planId}/theory`, data);
  }

  generateTheorySessions(planId: string, data: TheorySessionGenerateRequest) {
    return this.http.post<TheorySession[]>(`/api/v1/lesson-plans/${planId}/theory/generate`, data);
  }

  updateTheorySession(sessionId: string, data: TheorySessionUpdate) {
    return this.http.patch<TheorySession>(`/api/v1/lesson-plans/theory/${sessionId}`, data);
  }

  // ── Competency Dashboard ──
  getCompetencyDashboard(consultationId: string) {
    return this.http.get<CompetencyDashboardResponse>(`/api/v1/students/${consultationId}/competency-dashboard`);
  }
}
