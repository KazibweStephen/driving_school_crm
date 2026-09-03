import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface User {
  phone: string;
  name: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  is_company_admin: boolean;
  can_backdate: boolean;
  company_id: string | null;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
  branch_ids: string[];
  branch_names?: string[];
}

export interface UserCreate {
  phone: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role: string;
  company_id?: string | null;
  is_company_admin?: boolean;
  can_backdate?: boolean;
  branch_ids?: string[];
}

export interface UserUpdate {
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  status?: string;
  company_id?: string | null;
  is_company_admin?: boolean;
  can_backdate?: boolean;
  branch_ids?: string[];
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

export interface CompanyBasic {
  id: string;
  name: string;
}

export interface UserTransfer {
  id: string;
  user_phone: string;
  from_company: CompanyBasic;
  to_company: CompanyBasic;
  from_branch_ids: string[];
  to_branch_ids: string[];
  role_before: string;
  role_after: string;
  reason?: string;
  transferred_by: string;
  is_reversed: boolean;
  reversed_by?: string;
  reversed_at?: string;
  created_at: string;
}

export interface UserTransferRequest {
  target_company_id: string;
  target_branch_ids: string[];
  reason?: string;
}

export interface UserTransferListResponse {
  transfers: UserTransfer[];
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
    company_id?: string;
  }) {
    let httpParams = new HttpParams();
    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.role) httpParams = httpParams.set('role', params.role);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.page) httpParams = httpParams.set('page', params.page);
      if (params.page_size) httpParams = httpParams.set('page_size', params.page_size);
      if (params.company_id) httpParams = httpParams.set('company_id', params.company_id);
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

  approve(phone: string) {
    return this.http.post<User>(`/api/v1/users/${phone}/approve`, {});
  }

  changePin(data: PinChange) {
    return this.http.post<{ message: string }>('/api/v1/users/change-pin', data);
  }

  getProfile() {
    return this.http.get<User>('/api/v1/users/me');
  }

  transferUser(phone: string, data: UserTransferRequest) {
    return this.http.post<UserTransfer>(`/api/v1/users/${phone}/transfer`, data);
  }

  getUserTransfers(phone: string, params?: { page?: number; page_size?: number }) {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.page_size) httpParams = httpParams.set('page_size', params.page_size);
    return this.http.get<UserTransferListResponse>(`/api/v1/users/${phone}/transfers`, { params: httpParams });
  }

  reverseTransfer(transferId: string, reason?: string) {
    return this.http.post<UserTransfer>(`/api/v1/users/transfers/${transferId}/reverse`, { reason });
  }

  getTransferHistory(params?: {
    company_id?: string;
    user_phone?: string;
    page?: number;
    page_size?: number;
  }) {
    let httpParams = new HttpParams();
    if (params?.company_id) httpParams = httpParams.set('company_id', params.company_id);
    if (params?.user_phone) httpParams = httpParams.set('user_phone', params.user_phone);
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.page_size) httpParams = httpParams.set('page_size', params.page_size);
    return this.http.get<UserTransferListResponse>('/api/v1/users/transfers/history', { params: httpParams });
  }
}
