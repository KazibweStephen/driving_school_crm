import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CompetencyVersion {
  id: string;
  company_id: string;
  version: string;
  name: string;
  description: string | null;
  status: string;
  competency_count: number;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetencyCategory {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  competency_count: number;
  created_at: string;
  updated_at: string;
}

export interface Competency {
  id: string;
  version_id: string;
  category_id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  learning_outcome: string | null;
  assessment_criteria: string[] | null;
  difficulty: string;
  estimated_practice_minutes: number | null;
  training_category: string;
  display_order: number;
  is_active: boolean;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
  version?: CompetencyVersion;
  category?: CompetencyCategory;
  prerequisites?: Competency[];
}

export interface CompetencySearchResult {
  id: string;
  code: string;
  name: string;
  category_id: string;
  category_name: string | null;
  difficulty: string;
  training_category: string;
}

export interface PaginatedCompetencies {
  items: Competency[];
  total: number;
  page: number;
  page_size: number;
}

export interface LessonCompetencyLink {
  lesson_competency_id: string;
  competency_id: string;
  code: string;
  name: string;
  category_name: string | null;
  difficulty: string;
  training_category: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class CompetencyCatalogueService {
  constructor(private http: HttpClient) {}

  // ── Versions ──

  listVersions(status?: string, companyId?: string): Observable<CompetencyVersion[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (companyId) params = params.set('company_id', companyId);
    return this.http.get<CompetencyVersion[]>('/api/v1/competency-versions', { params });
  }

  getVersion(id: string): Observable<CompetencyVersion> {
    return this.http.get<CompetencyVersion>(`/api/v1/competency-versions/${id}`);
  }

  createVersion(data: { version: string; name: string; description?: string }): Observable<CompetencyVersion> {
    return this.http.post<CompetencyVersion>('/api/v1/competency-versions', data);
  }

  updateVersion(id: string, data: { name?: string; description?: string; status?: string }): Observable<CompetencyVersion> {
    return this.http.patch<CompetencyVersion>(`/api/v1/competency-versions/${id}`, data);
  }

  activateVersion(id: string): Observable<CompetencyVersion> {
    return this.http.post<CompetencyVersion>(`/api/v1/competency-versions/${id}/activate`, {});
  }

  deleteVersion(id: string): Observable<any> {
    return this.http.delete(`/api/v1/competency-versions/${id}`);
  }

  // ── Categories ──

  listCategories(includeInactive?: boolean, companyId?: string): Observable<CompetencyCategory[]> {
    let params = new HttpParams();
    if (includeInactive) params = params.set('include_inactive', 'true');
    if (companyId) params = params.set('company_id', companyId);
    return this.http.get<CompetencyCategory[]>('/api/v1/competency-categories', { params });
  }

  createCategory(data: { name: string; description?: string; display_order?: number }): Observable<CompetencyCategory> {
    return this.http.post<CompetencyCategory>('/api/v1/competency-categories', data);
  }

  updateCategory(id: string, data: { name?: string; description?: string; display_order?: number; is_active?: boolean }): Observable<CompetencyCategory> {
    return this.http.patch<CompetencyCategory>(`/api/v1/competency-categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<any> {
    return this.http.delete(`/api/v1/competency-categories/${id}`);
  }

  // ── Competencies ──

  listCompetencies(params: {
    version_id?: string;
    category_id?: string;
    difficulty?: string;
    training_category?: string;
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
    company_id?: string;
  } = {}): Observable<PaginatedCompetencies> {
    let httpParams = new HttpParams();
    if (params.version_id) httpParams = httpParams.set('version_id', params.version_id);
    if (params.category_id) httpParams = httpParams.set('category_id', params.category_id);
    if (params.difficulty) httpParams = httpParams.set('difficulty', params.difficulty);
    if (params.training_category) httpParams = httpParams.set('training_category', params.training_category);
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.is_active !== undefined) httpParams = httpParams.set('is_active', String(params.is_active));
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.page_size) httpParams = httpParams.set('page_size', String(params.page_size));
    if (params.company_id) httpParams = httpParams.set('company_id', params.company_id);
    return this.http.get<PaginatedCompetencies>('/api/v1/competencies', { params: httpParams });
  }

  getCompetency(id: string): Observable<Competency> {
    return this.http.get<Competency>(`/api/v1/competencies/${id}`);
  }

  createCompetency(data: Partial<Competency> & { prerequisite_ids?: string[] }): Observable<Competency> {
    return this.http.post<Competency>('/api/v1/competencies', data);
  }

  updateCompetency(id: string, data: Partial<Competency> & { prerequisite_ids?: string[] }): Observable<Competency> {
    return this.http.patch<Competency>(`/api/v1/competencies/${id}`, data);
  }

  deactivateCompetency(id: string): Observable<Competency> {
    return this.http.post<Competency>(`/api/v1/competencies/${id}/deactivate`, {});
  }

  // ── Search (for picker) ──

  searchCompetencies(params: {
    q?: string;
    category_id?: string;
    difficulty?: string;
    training_category?: string;
    version_id?: string;
    company_id?: string;
  } = {}): Observable<CompetencySearchResult[]> {
    let httpParams = new HttpParams();
    if (params.q) httpParams = httpParams.set('q', params.q);
    if (params.category_id) httpParams = httpParams.set('category_id', params.category_id);
    if (params.difficulty) httpParams = httpParams.set('difficulty', params.difficulty);
    if (params.training_category) httpParams = httpParams.set('training_category', params.training_category);
    if (params.version_id) httpParams = httpParams.set('version_id', params.version_id);
    if (params.company_id) httpParams = httpParams.set('company_id', params.company_id);
    return this.http.get<CompetencySearchResult[]>('/api/v1/competencies/search', { params: httpParams });
  }

  // ── Bulk Import ──

  bulkImport(competencies: Partial<Competency>[]): Observable<{ created: number; skipped: number; errors: string[] }> {
    return this.http.post<{ created: number; skipped: number; errors: string[] }>('/api/v1/competency-import', { competencies });
  }

  // ── Lesson ↔ Competency Links ──

  getLessonCompetencies(lessonId: string): Observable<LessonCompetencyLink[]> {
    return this.http.get<LessonCompetencyLink[]>(`/api/v1/lesson-library/${lessonId}/competencies`);
  }

  setLessonCompetencies(lessonId: string, links: { competency_id: string; order: number }[]): Observable<LessonCompetencyLink[]> {
    return this.http.put<LessonCompetencyLink[]>(`/api/v1/lesson-library/${lessonId}/competencies`, links);
  }
}
