import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface PermitProgress {
  id: string;
  cart_item_id: string;
  start_date: string | null;
  got_learners_permit_date: string | null;
  learners_due_date: string | null;
  learners_expiry_date: string | null;
  tested_on_date: string | null;
  expecting_permit_on_date: string | null;
  delayed_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermitProgressUpdate {
  start_date?: string | null;
  got_learners_permit_date?: string | null;
  learners_due_date?: string | null;
  learners_expiry_date?: string | null;
  tested_on_date?: string | null;
  expecting_permit_on_date?: string | null;
  delayed_days?: number | null;
  notes?: string | null;
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
}
