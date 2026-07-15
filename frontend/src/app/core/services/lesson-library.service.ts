import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface VideoLibrary {
  id: string;
  title: string;
  source: string;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  qr_code_data: string | null;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonLibraryCompetency {
  lesson_competency_id: string;
  competency_id: string;
  code: string;
  name: string;
  category_name: string | null;
  difficulty: string;
  training_category: string;
  order: number;
}

export interface LessonLibrary {
  id: string;
  title: string;
  description: string | null;
  transmission_type: string | null;
  lesson_objectives: string[];
  practical_objectives: string[];
  estimated_minutes: number;
  estimated_distance_km: number;
  required_vehicle: string | null;
  difficulty: string;
  status: string;
  lesson_number: number | null;
  day_number: number | null;
  week_number: number | null;
  order: number | null;
  preferred_location: string | null;
  training_category: string;
  is_theory: boolean;
  prerequisite_lessons: { id: string; title: string; lesson_number: number }[];
  competency_links: LessonLibraryCompetency[];
  videos: VideoLibrary[];
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonLibraryCreate {
  title: string;
  description?: string;
  transmission_type?: string;
  lesson_objectives?: string[];
  practical_objectives?: string[];
  estimated_minutes?: number;
  estimated_distance_km?: number;
  required_vehicle?: string;
  difficulty?: string;
  lesson_number?: number;
  day_number?: number;
  week_number?: number;
  order?: number;
  preferred_location?: string;
  training_category?: string;
  prerequisite_lesson_ids?: string[];
  video_ids?: string[];
  is_theory?: boolean;
  competency_ids?: string[];
}


export interface LessonLibraryUpdate {
  title?: string;
  description?: string;
  transmission_type?: string;
  lesson_objectives?: string[];
  practical_objectives?: string[];
  estimated_minutes?: number;
  estimated_distance_km?: number;
  required_vehicle?: string;
  difficulty?: string;
  status?: string;
  lesson_number?: number;
  day_number?: number;
  week_number?: number;
  order?: number;
  preferred_location?: string;
  training_category?: string;
  prerequisite_lesson_ids?: string[];
  is_theory?: boolean;
  competency_ids?: string[];
}

@Injectable({ providedIn: 'root' })
export class LessonLibraryService {
  constructor(private http: HttpClient) {}

  list(params?: { transmission_type?: string; difficulty?: string; status?: string; search?: string }) {
    return this.http.get<LessonLibrary[]>('/api/v1/lesson-library', { params });
  }

  get(id: string) {
    return this.http.get<LessonLibrary>(`/api/v1/lesson-library/${id}`);
  }

  create(data: LessonLibraryCreate) {
    return this.http.post<LessonLibrary>('/api/v1/lesson-library', data);
  }

  update(id: string, data: LessonLibraryUpdate) {
    return this.http.patch<LessonLibrary>(`/api/v1/lesson-library/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/v1/lesson-library/${id}`);
  }

  attachVideo(lessonId: string, videoId: string) {
    return this.http.post(`/api/v1/lesson-library/${lessonId}/videos/${videoId}`, {});
  }

  detachVideo(lessonId: string, videoId: string) {
    return this.http.delete(`/api/v1/lesson-library/${lessonId}/videos/${videoId}`);
  }
}
