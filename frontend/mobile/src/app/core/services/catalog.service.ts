import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface Package {
  id: string;
  product_id: string;
  name: string;
  price: string;
  duration_label: string | null;
  requires_driving_training: boolean;
  requires_theory_training: boolean;
  requires_permit_processing: boolean;
  driving_training_duration_days: number | null;
  theory_training_hours: number | null;
  permit_processing_duration_days: number | null;
  is_extension: boolean;
  extension_days: number | null;
  status: string;
}

export interface Product {
  id: string;
  name: string;
  duration_label: string | null;
  description: string | null;
  is_extension: boolean;
  status: string;
  packages: Package[];
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  transmission: string;
  status: string;
  branch_ids: string[];
}

export interface LessonPlanTemplate {
  id: string;
  name: string;
  description: string | null;
  transmission_type: string;
  template_type: string;
  total_days: number;
  total_weeks: number;
  status: string;
  is_locked: boolean;
}

export interface User {
  phone: string;
  name: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  branch_ids: string[];
}

export interface UserListResponse {
  users: User[];
  total: number;
}

export interface Branch {
  id: string;
  company_id: string;
  name: string;
  code: string;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  constructor(private http: HttpClient) {}

  listProducts(params?: { status?: string; page_size?: number; page?: number }) {
    let httpParams = new HttpParams();
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.page_size != null) httpParams = httpParams.set('page_size', String(params.page_size));
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    return this.http.get<ProductListResponse>('/api/v1/products/', { params: httpParams });
  }

  listVehicles() {
    return this.http.get<Vehicle[]>('/api/v1/vehicles');
  }

  listTemplates() {
    return this.http.get<LessonPlanTemplate[]>('/api/v1/lesson-plan-templates');
  }

  listInstructors() {
    const params = new HttpParams().set('role', 'instructor').set('page_size', '100');
    return this.http.get<UserListResponse>('/api/v1/users/', { params });
  }

  listUsers(params?: { role?: string; page_size?: number; search?: string }) {
    let httpParams = new HttpParams();
    if (params?.role) httpParams = httpParams.set('role', params.role);
    if (params?.page_size != null) httpParams = httpParams.set('page_size', String(params.page_size));
    if (params?.search) httpParams = httpParams.set('search', params.search);
    return this.http.get<UserListResponse>('/api/v1/users/', { params: httpParams });
  }

  listMyBranches() {
    return this.http.get<Branch[]>('/api/v1/companies/my-branches');
  }

  getCurrentUser() {
    return this.http.get<User>('/api/v1/users/me');
  }
}
