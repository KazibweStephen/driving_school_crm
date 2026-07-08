import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface User {
  phone: string;
  name: string;
  role: string;
  status: string;
  is_company_admin: boolean;
  can_backdate: boolean;
  company_id: string | null;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreate {
  phone: string;
  name: string;
  role: string;
  company_id?: string | null;
  is_company_admin?: boolean;
  can_backdate?: boolean;
}

export interface UserUpdate {
  name?: string;
  role?: string;
  status?: string;
  company_id?: string | null;
  is_company_admin?: boolean;
  can_backdate?: boolean;
}

export interface PinChange {
  old_pin: string;
  new_pin: string;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient) {}

  list(params?: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }) {
    let httpParams = new HttpParams();
    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.role) httpParams = httpParams.set('role', params.role);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.page) httpParams = httpParams.set('page', params.page);
      if (params.page_size) httpParams = httpParams.set('page_size', params.page_size);
    }
    return this.http.get<UserListResponse>('/api/v1/users/', { params: httpParams });
  }

  getByPhone(phone: string) {
    return this.http.get<User>(`/api/v1/users/${phone}`);
  }

  create(data: UserCreate) {
    return this.http.post<User>('/api/v1/users/', data);
  }

  update(phone: string, data: UserUpdate) {
    return this.http.patch<User>(`/api/v1/users/${phone}`, data);
  }

  deactivate(phone: string) {
    return this.http.delete<User>(`/api/v1/users/${phone}`);
  }

  resetPin(phone: string) {
    return this.http.post<{ message: string; new_pin: string }>(
      `/api/v1/users/${phone}/reset-pin`,
      {},
    );
  }

  changePin(data: PinChange) {
    return this.http.post<{ message: string }>('/api/v1/users/change-pin', data);
  }

  getProfile() {
    return this.http.get<User>('/api/v1/users/me');
  }
}
