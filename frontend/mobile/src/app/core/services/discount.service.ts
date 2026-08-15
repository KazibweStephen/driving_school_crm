import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type DiscountType = 'fixed' | 'percentage';
export type DiscountAppliesTo = 'all' | 'product' | 'package';
export type DiscountStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface Discount {
  id: string;
  code: string;
  name: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  applies_to: DiscountAppliesTo;
  product_ids?: string[];
  package_ids?: string[];
  start_date: string;
  end_date?: string;
  is_active: boolean;
  status: DiscountStatus;
  requested_by: string;
  requested_by_name?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  branch_id: string;
  branch_name?: string;
  company_id: string;
  max_uses?: number;
  used_count: number;
  created_at: string;
  updated_at: string;
}

export interface CartItemDiscount {
  id: string;
  cart_item_id: string;
  discount_id: string;
  discount_code: string;
  discount_name: string;
  applied_amount: number;
  applied_by: string;
  applied_at: string;
}

@Injectable({ providedIn: 'root' })
export class DiscountService {
  private base = '/api/v1/discounts';

  constructor(private http: HttpClient) {}

  apply(discountId: string, cartItemId: string): Observable<CartItemDiscount> {
    return this.http.post<CartItemDiscount>(`${this.base}/apply`, {
      discount_id: discountId,
      cart_item_id: cartItemId,
    });
  }

  getApplicableDiscounts(cartItemId: string): Observable<Discount[]> {
    return this.http.get<Discount[]>(`${this.base}/applicable/${cartItemId}`);
  }

  getApplicableDiscountsForProduct(productId: string, packageId?: string | null): Observable<Discount[]> {
    let params = new HttpParams().set('product_id', productId);
    if (packageId) params = params.set('package_id', packageId);
    return this.http.get<Discount[]>(`${this.base}/applicable-for-product`, { params });
  }

  getCartItemDiscounts(cartItemId: string): Observable<CartItemDiscount[]> {
    return this.http.get<CartItemDiscount[]>(`${this.base}/cart-item/${cartItemId}`);
  }
}
