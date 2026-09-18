import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PermitTracker {
  cart_item_id: string;
  consultation_id: string;
  client_name: string;
  client_phone: string;
  branch_id: string;
  branch_name: string;
  product_id: string;
  product_name: string;
  package_id: string;
  package_name: string;
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

export interface PermitTrackerListResponse {
  trackers: PermitTracker[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

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

export interface PermitExpenseItemCreate {
  category_code: string;
  amount: number;
  description?: string | null;
}

export interface PermitExpenseRecordCreate {
  expenses: PermitExpenseItemCreate[];
  expense_date?: string | null;
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
export class PermitService {
  constructor(private http: HttpClient) {}

  listPermitTrackers(params: {
    search?: string;
    branch_ids?: string[];
    status?: string;
    page?: number;
    page_size?: number;
  }) {
    let p = new HttpParams();
    if (params.search) p = p.set('search', params.search);
    if (params.branch_ids?.length) p = p.set('branch_ids', params.branch_ids.join(','));
    if (params.status) p = p.set('status', params.status);
    if (params.page != null) p = p.set('page', String(params.page));
    if (params.page_size != null) p = p.set('page_size', String(params.page_size));
    return this.http.get<PermitTrackerListResponse>('/api/v1/permits/', { params: p });
  }

  getPermitProgress(cartItemId: string) {
    return this.http.get<PermitProgress>(`/api/v1/cart-items/${cartItemId}/permit-progress`);
  }

  updatePermitProgress(cartItemId: string, data: Partial<PermitProgress>) {
    return this.http.patch<PermitProgress>(`/api/v1/cart-items/${cartItemId}/permit-progress`, data);
  }

  uploadPermitPhoto(cartItemId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<PermitProgress>(`/api/v1/permits/${cartItemId}/photo`, form);
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

  getPermitNotifications(limit = 20): Observable<PermitNotificationsResponse> {
    const p = new HttpParams().set('limit', String(limit));
    return this.http.get<PermitNotificationsResponse>('/api/v1/permits/notifications', { params: p });
  }
}
