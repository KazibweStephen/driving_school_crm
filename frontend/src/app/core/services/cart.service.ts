import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface CartItemRead {
  id: string;
  consultation_id: string;
  product_id: string;
  package_id: string | null;
  status: string;
  notes: string | null;
  is_important: boolean;
  recovery_reason: string | null;
  requires_driving_training: boolean;
  requires_theory_training: boolean;
  requires_permit_processing: boolean;
  driving_training_duration_days: number | null;
  theory_training_hours: number | null;
  permit_processing_duration_days: number | null;
  learners_permit_eligibility_amount?: number | null;
  test_eligibility_amount?: number | null;
  product_name?: string | null;
  package_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemExpectedExpenseType {
  category: string;
  amount: number;
  already_paid: boolean;
}

export interface CartItemExpectedExpenses {
  cart_item_id: string;
  product_id: string;
  package_id: string | null;
  product_name: string | null;
  package_name: string | null;
  items: CartItemExpectedExpenseType[];
}

export interface CartItemCreate {
  product_id: string;
  package_id?: string;
  notes?: string;
  is_important?: boolean;
  converter_id?: string;
  primary_recommender_id?: string;
  secondary_recommender_id?: string;
}

export interface CartItemUpdate {
  status?: string;
  notes?: string;
  recovery_reason?: string;
  converter_id?: string;
  primary_recommender_id?: string;
  secondary_recommender_id?: string;
}

@Injectable({ providedIn: 'root' })
export class CartItemService {
  constructor(private http: HttpClient) {}

  list(consultationId: string) {
    return this.http.get<CartItemRead[]>(`/api/v1/consultations/${consultationId}/cart-items`);
  }

  getExpectedExpenses(itemId: string) {
    return this.http.get<CartItemExpectedExpenses>(`/api/v1/cart-items/${itemId}/expected-expenses`);
  }

  create(consultationId: string, data: CartItemCreate) {
    return this.http.post<CartItemRead>(`/api/v1/consultations/${consultationId}/cart-items`, data);
  }

  update(itemId: string, data: CartItemUpdate) {
    return this.http.patch<CartItemRead>(`/api/v1/cart-items/${itemId}`, data);
  }

  remove(itemId: string) {
    return this.http.delete<void>(`/api/v1/cart-items/${itemId}`);
  }
}
