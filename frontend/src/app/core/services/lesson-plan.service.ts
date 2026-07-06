import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface LessonTemplateItem {
  id: string;
  template_id: string;
  day_number: number;
  week_number: number;
  title: string;
  description: string | null;
  transmission_type: string | null;
  lesson_objectives: any;
  practical_objectives: any;
  competencies: any;
  estimated_minutes: number;
  estimated_distance_km: number;
  difficulty: string;
  order: number;
  lesson_library_id: string | null;
  preferred_location: string | null;
  enforce_prerequisites: boolean;
  is_theory: boolean;
  training_category: string;
  prerequisite_competencies: any;
  prerequisite_lesson_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface LessonPlanTemplate {
  id: string;
  name: string;
  transmission_type: string;
  description: string | null;
  total_days: number;
  total_weeks: number;
  template_type: string;
  lesson_items: LessonTemplateItem[];
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonTemplateItemCreate {
  id?: string;
  day_number: number;
  week_number: number;
  title: string;
  description?: string;
  transmission_type?: string;
  lesson_objectives?: string[];
  practical_objectives?: string[];
  competencies?: string[];
  estimated_minutes?: number;
  estimated_distance_km?: number;
  difficulty?: string;
  order?: number;
  lesson_library_id?: string;
  preferred_location?: string;
  enforce_prerequisites?: boolean;
  training_category?: string;
  prerequisite_competencies?: string[];
  prerequisite_lesson_ids?: string[];
  is_theory?: boolean;
}

export interface LessonTemplateItemUpdate {
  day_number?: number;
  week_number?: number;
  title?: string;
  description?: string;
  transmission_type?: string;
  lesson_objectives?: string[];
  practical_objectives?: string[];
  competencies?: string[];
  estimated_minutes?: number;
  estimated_distance_km?: number;
  difficulty?: string;
  order?: number;
  lesson_library_id?: string;
  preferred_location?: string;
  enforce_prerequisites?: boolean;
  training_category?: string;
  prerequisite_competencies?: string[];
  prerequisite_lesson_ids?: string[];
  is_theory?: boolean;
}

export interface LessonPlanTemplateCreate {
  name: string;
  transmission_type: string;
  description?: string;
  total_days?: number;
  total_weeks?: number;
  template_type?: string;
  items: LessonTemplateItemCreate[];
}

export interface LessonPlanTemplateUpdate {
  name?: string;
  description?: string;
  total_days?: number;
  total_weeks?: number;
  template_type?: string;
  items?: LessonTemplateItemCreate[];
}

export interface ClientLesson {
  id: string;
  lesson_plan_id: string;
  template_item_id: string | null;
  lesson_library_id: string | null;
  day_number: number;
  week_number: number;
  title: string;
  lesson_objectives: string[];
  practical_objectives: string[];
  order: number;
  is_active: boolean;
  is_locked: boolean;
  status: string;
  difficulty: string | null;
  vehicle_inspection_minutes: number | null;
  cockpit_drill_minutes: number | null;
  video_illustration_minutes: number | null;
  practical_driving_minutes: number | null;
  assessment_minutes: number | null;
  driving_minutes: number | null;
  theory_minutes: number | null;
  mileage_km: number | null;
  is_theory: boolean;
  combined_with_next: boolean;
  skills_achieved: any[] | null;
  outcome: string | null;
  instructor_id: string | null;
  vehicle_id: string | null;
  preferred_location: string | null;
  enforce_prerequisites: boolean;
  completed_at: string | null;
  // Scheduling fields
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number;
  plan_locked_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  is_extension: boolean;
  extension_of_plan_id: string | null;
  extension_days_added: number | null;
  template_type: string;
  notes: string | null;
  manual_days: number | null;
  lessons: ClientLesson[];
  created_at: string;
  updated_at: string;
}

export interface ClientLessonPlanCreate {
  template_id?: string;
  theory_template_id?: string;
  transmission_type: string;
  start_date?: string;
  is_extension?: boolean;
  extension_of_plan_id?: string;
  extension_days_added?: number;
  notes?: string;
  manual_days?: number;
  lessons?: { day_number: number; week_number: number; title: string; lesson_objectives?: string[]; practical_objectives?: string[]; order?: number; is_active?: boolean; is_theory?: boolean; preferred_location?: string; enforce_prerequisites?: boolean }[];
}

export interface ClientLessonPlanUpdate {
  start_date?: string;
  status?: string;
  purchased_days?: number;
  is_extension?: boolean;
  extension_of_plan_id?: string;
  extension_days_added?: number;
  notes?: string;
  manual_days?: number;
}

export interface ClientLessonUpdate {
  day_number?: number;
  week_number?: number;
  title?: string;
  lesson_objectives?: string[];
  practical_objectives?: string[];
  order?: number;
  is_active?: boolean;
  is_locked?: boolean;
  status?: string;
  difficulty?: string;
  vehicle_inspection_minutes?: number | null;
  cockpit_drill_minutes?: number | null;
  video_illustration_minutes?: number | null;
  practical_driving_minutes?: number | null;
  assessment_minutes?: number | null;
  driving_minutes?: number | null;
  theory_minutes?: number | null;
  mileage_km?: number | null;
  is_theory?: boolean;
  combined_with_next?: boolean;
  skills_achieved?: any[];
  outcome?: string;
  instructor_id?: string;
  vehicle_id?: string;
  preferred_location?: string;
  enforce_prerequisites?: boolean;
  notes?: string | null;
}

export interface LessonReorderItem {
  id: string;
  order: number;
  week_number?: number;
  day_number?: number;
}

export interface LessonBulkReorder {
  lessons: LessonReorderItem[];
}

@Injectable({ providedIn: 'root' })
export class LessonPlanService {
  constructor(private http: HttpClient) {}

  // ── Templates ──

  listTemplates(transmission_type?: string) {
    let params: any = {};
    if (transmission_type) params.transmission_type = transmission_type;
    return this.http.get<LessonPlanTemplate[]>('/api/v1/lesson-plan-templates', { params });
  }

  getTemplate(id: string) {
    return this.http.get<LessonPlanTemplate>(`/api/v1/lesson-plan-templates/${id}`);
  }

  createTemplate(data: LessonPlanTemplateCreate) {
    return this.http.post<LessonPlanTemplate>('/api/v1/lesson-plan-templates', data);
  }

  updateTemplate(id: string, data: LessonPlanTemplateUpdate) {
    return this.http.patch<LessonPlanTemplate>(`/api/v1/lesson-plan-templates/${id}`, data);
  }

  deleteTemplate(id: string) {
    return this.http.delete(`/api/v1/lesson-plan-templates/${id}`);
  }

  // ── Template Items ──

  updateTemplateItem(itemId: string, data: any) {
    return this.http.patch<any>(`/api/v1/lesson-plan-templates/items/${itemId}`, data);
  }

  deleteTemplateItem(itemId: string) {
    return this.http.delete(`/api/v1/lesson-plan-templates/items/${itemId}`);
  }

  // ── Client Lesson Plans ──

  listClientPlans(cartItemId: string) {
    return this.http.get<ClientLessonPlan[]>(`/api/v1/cart-items/${cartItemId}/lesson-plans`);
  }

  createClientPlan(cartItemId: string, data: ClientLessonPlanCreate) {
    return this.http.post<ClientLessonPlan>(`/api/v1/cart-items/${cartItemId}/lesson-plans`, data);
  }

  getClientPlan(planId: string) {
    return this.http.get<ClientLessonPlan>(`/api/v1/lesson-plans/${planId}`);
  }

  updateClientPlan(planId: string, data: ClientLessonPlanUpdate) {
    return this.http.patch<ClientLessonPlan>(`/api/v1/lesson-plans/${planId}`, data);
  }

  deleteClientPlan(planId: string, deleteMode: string = 'all') {
    return this.http.delete(`/api/v1/lesson-plans/${planId}?delete_mode=${deleteMode}`);
  }

  // ── Client Lessons ──

  updateClientLesson(lessonId: string, data: ClientLessonUpdate) {
    return this.http.patch<ClientLesson>(`/api/v1/lesson-plans/lessons/${lessonId}`, data);
  }

  bulkReorder(planId: string, data: LessonBulkReorder) {
    return this.http.post<ClientLesson[]>(`/api/v1/lesson-plans/${planId}/reorder`, data);
  }

  // ── New: Duplicate / Archive / Export / Import / Generate / Upgrade ──

  duplicateTemplate(templateId: string, name: string) {
    return this.http.post<LessonPlanTemplate>(`/api/v1/lesson-plan-templates/${templateId}/duplicate?name=${encodeURIComponent(name)}`, {});
  }

  archiveTemplate(templateId: string) {
    return this.http.post<LessonPlanTemplate>(`/api/v1/lesson-plan-templates/${templateId}/archive`, {});
  }

  exportTemplate(templateId: string) {
    return this.http.get<any>(`/api/v1/lesson-plan-templates/${templateId}/export`);
  }

  importTemplate(data: any) {
    return this.http.post<any>('/api/v1/lesson-plan-templates/import', data);
  }

  validateImport(data: any) {
    return this.http.post<any>('/api/v1/lesson-plan-templates/validate', data);
  }

  generateStudentPlan(cartItemId: string, templateId: string, transmissionType: string, startDate: string, purchasedDays: number, notes?: string) {
    let params: any = { template_id: templateId, transmission_type: transmissionType, start_date: startDate, purchased_days: purchasedDays };
    if (notes) params.notes = notes;
    return this.http.post<ClientLessonPlan>(`/api/v1/cart-items/${cartItemId}/lesson-plans/generate`, {}, { params });
  }

  upgradePlan(planId: string, purchasedDays: number) {
    return this.http.post<ClientLessonPlan>(`/api/v1/lesson-plans/${planId}/upgrade?purchased_days=${purchasedDays}`, {});
  }

  startLesson(lessonId: string) {
    return this.http.post<ClientLesson>(`/api/v1/lesson-plans/lessons/${lessonId}/start`, {});
  }

  completeLesson(lessonId: string, outcome?: string, notes?: string) {
    let params: any = {};
    if (outcome) params.outcome = outcome;
    if (notes) params.notes = notes;
    return this.http.post<ClientLesson>(`/api/v1/lesson-plans/lessons/${lessonId}/complete`, {}, { params });
  }

  skipLesson(lessonId: string) {
    return this.http.post<ClientLesson>(`/api/v1/lesson-plans/lessons/${lessonId}/skip`, {});
  }

  moveLesson(lessonId: string, newDayNumber: number) {
    return this.http.post<ClientLesson[]>(`/api/v1/lesson-plans/lessons/${lessonId}/move?new_day_number=${newDayNumber}`, {});
  }

  getLessonHistory(lessonId: string) {
    return this.http.get<any[]>(`/api/v1/lesson-plans/lessons/${lessonId}/history`);
  }

  // ── Lesson Timer ──

  getLessonTimer(lessonId: string) {
    return this.http.get<any>(`/api/v1/lessons/${lessonId}/timer`);
  }

  startLessonTimer(lessonId: string) {
    return this.http.post<any>(`/api/v1/lessons/${lessonId}/timer/start`, {});
  }

  syncLessonTimer(lessonId: string, totalSeconds: number, distanceKm?: number) {
    return this.http.put<any>(`/api/v1/lessons/${lessonId}/timer/sync`, {
      total_seconds: totalSeconds,
      distance_km: distanceKm,
    });
  }

  pauseLessonTimer(lessonId: string) {
    return this.http.post<any>(`/api/v1/lessons/${lessonId}/timer/pause`, {});
  }

  resumeLessonTimer(lessonId: string) {
    return this.http.post<any>(`/api/v1/lessons/${lessonId}/timer/resume`, {});
  }
}
