import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface PermitProgress {
  id: string;
  cart_item_id: string;
  start_date: string | null;
  got_learners_permit_date: string | null;
  learners_due_date: string | null;
  learners_expiry_date: string | null;
  learners_permit_photo_url: string | null;
  test_ready: boolean;
  waiting_for_permit: boolean;
  permit_paid: boolean;
  permit_received_date: string | null;
  tested_on_date: string | null;
  test_date: string | null;
  expecting_permit_on_date: string | null;
  delayed_days: number | null;
  notes: string | null;
  eligibility_overridden: boolean;
  eligibility_override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermitProgressUpdate {
  start_date?: string | null;
  got_learners_permit_date?: string | null;
  learners_due_date?: string | null;
  learners_expiry_date?: string | null;
  learners_permit_photo_url?: string | null;
  test_ready?: boolean;
  waiting_for_permit?: boolean;
  permit_paid?: boolean;
  permit_received_date?: string | null;
  tested_on_date?: string | null;
  test_date?: string | null;
  expecting_permit_on_date?: string | null;
  delayed_days?: number | null;
  notes?: string | null;
}

export interface PermitTracker {
  cart_item_id: string;
  consultation_id: string;
  client_name: string;
  client_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  product_id: string;
  product_name: string;
  package_id: string | null;
  package_name: string | null;
  total_amount: number;
  discount_amount: number;
  total_paid: number;
  balance: number;
  paid_ratio: number;
  start_date: string | null;
  got_learners_permit_date: string | null;
  learners_due_date: string | null;
  learners_expiry_date: string | null;
  learners_permit_photo_url: string | null;
  test_ready: boolean;
  waiting_for_permit: boolean;
  permit_paid: boolean;
  permit_received_date: string | null;
  tested_on_date: string | null;
  test_date: string | null;
  expecting_permit_on_date: string | null;
  delayed_days: number | null;
  notes: string | null;
  status: string;
  days_to_maturity: number | null;
  days_to_expiry: number | null;
  days_since_test: number | null;
  eligibility_overridden: boolean;
  eligibility_override_reason: string | null;
  learner_expense_paid: boolean;
  testing_expense_paid: boolean;
  permit_expense_paid: boolean;
  learner_expense_status: string | null;
  testing_expense_status: string | null;
  permit_expense_status: string | null;
}

export interface PermitExpenseItemCreate {
  category_code: string;
  amount: number;
  description?: string | null;
}

export interface PermitExpenseRecordCreate {
  expenses: PermitExpenseItemCreate[];
  expense_date?: string | null;
}

export interface PermitAuditLog {
  id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface PermitTrackerListResponse {
  trackers: PermitTracker[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PermitTrackerParams {
  search?: string;
  branch_ids?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface PermitNotificationItem {
  id: string;
  cart_item_id: string;
  consultation_id: string;
  client_name: string;
  client_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  status: string;
  message: string;
  created_at: string;
}

export interface PermitNotificationsResponse {
  items: PermitNotificationItem[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class PermitProgressService {
  constructor(private http: HttpClient) {}

  get(cartItemId: string) {
    return this.http.get<PermitProgress | null>(`/api/v1/cart-items/${cartItemId}/permit-progress`);
  }

  update(cartItemId: string, data: PermitProgressUpdate) {
    return this.http.patch<PermitProgress>(`/api/v1/cart-items/${cartItemId}/permit-progress`, data);
  }

  listTrackers(params: PermitTrackerParams) {
    let hp = new HttpParams();
    if (params.search) hp = hp.set('search', params.search);
    if (params.branch_ids) hp = hp.set('branch_ids', params.branch_ids);
    if (params.status) hp = hp.set('status', params.status);
    if (params.page) hp = hp.set('page', String(params.page));
    if (params.page_size) hp = hp.set('page_size', String(params.page_size));
    return this.http.get<PermitTrackerListResponse>('/api/v1/permits/', { params: hp });
  }

  getPermitNotifications(limit = 20) {
    return this.http.get<PermitNotificationsResponse>('/api/v1/permits/notifications', {
      params: new HttpParams().set('limit', String(limit)),
    });
  }

  uploadPhoto(cartItemId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<PermitProgress>(`/api/v1/permits/${cartItemId}/photo`, formData);
  }

  overrideEligibility(cartItemId: string, eligible: boolean, reason: string) {
    return this.http.post<PermitProgress>(
      `/api/v1/cart-items/${cartItemId}/permit-progress/override-eligibility`,
      { eligible, reason }
    );
  }

  getAuditLogs(cartItemId: string) {
    return this.http.get<PermitAuditLog[]>(`/api/v1/cart-items/${cartItemId}/permit-progress/audit`);
  }

  recordExpense(cartItemId: string, data: PermitExpenseRecordCreate) {
    return this.http.post<PermitProgress>(
      `/api/v1/cart-items/${cartItemId}/permit-progress/record-expense`,
      data
    );
  }
}