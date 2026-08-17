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
  branch_id?: string;
  branch_name?: string;
  branch_ids: string[];
  branch_names: string[];
  company_id: string;
  max_uses?: number;
  used_count: number;
  created_at: string;
  updated_at: string;
}

export interface DiscountCreate {
  code: string;
  name: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  applies_to?: DiscountAppliesTo;
  product_ids?: string[];
  package_ids?: string[];
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  branch_ids: string[];
  max_uses?: number;
}

export interface DiscountUpdate {
  code?: string;
  name?: string;
  description?: string;
  discount_value?: number;
  applies_to?: DiscountAppliesTo;
  product_ids?: string[];
  package_ids?: string[];
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  branch_ids?: string[];
  max_uses?: number;
}

export interface DiscountListResponse {
  discounts: Discount[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
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

export interface DiscountNotification {
  id: string;
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  branch_ids: string[];
  branch_names: string[];
  requested_by: string;
  requested_by_name: string;
  created_at: string;
}

export interface DiscountNotificationResponse {
  items: DiscountNotification[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class DiscountService {
  private base = '/api/v1/discounts';

  constructor(private http: HttpClient) {}

  list(params?: {
    search?: string;
    status?: string;
    branch_ids?: string;
    page?: number;
    page_size?: number;
  }): Observable<DiscountListResponse> {
    let httpParams = new HttpParams();
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.branch_ids) httpParams = httpParams.set('branch_ids', params.branch_ids);
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.page_size) httpParams = httpParams.set('page_size', params.page_size);
    return this.http.get<DiscountListResponse>(`${this.base}/`, { params: httpParams });
  }

  get(id: string): Observable<Discount> {
    return this.http.get<Discount>(`${this.base}/${id}`);
  }

  create(data: DiscountCreate): Observable<Discount> {
    return this.http.post<Discount>(`${this.base}/`, data);
  }

  update(id: string, data: DiscountUpdate): Observable<Discount> {
    return this.http.patch<Discount>(`${this.base}/${id}`, data);
  }

  approve(id: string, reason?: string): Observable<Discount> {
    return this.http.post<Discount>(`${this.base}/${id}/approve`, { reason });
  }

  reject(id: string, reason: string): Observable<Discount> {
    return this.http.post<Discount>(`${this.base}/${id}/reject`, { reason });
  }

  toggleActive(id: string): Observable<Discount> {
    return this.http.post<Discount>(`${this.base}/${id}/toggle-active`, {});
  }

  apply(discountId: string, cartItemId: string): Observable<CartItemDiscount> {
    return this.http.post<CartItemDiscount>(`${this.base}/apply`, {
      discount_id: discountId,
      cart_item_id: cartItemId,
    });
  }

  remove(cartItemDiscountId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/remove`, {
      cart_item_discount_id: cartItemDiscountId,
    });
  }

  getCartItemDiscounts(cartItemId: string): Observable<CartItemDiscount[]> {
    return this.http.get<CartItemDiscount[]>(`${this.base}/cart-item/${cartItemId}`);
  }

  getApplicableDiscounts(cartItemId: string): Observable<Discount[]> {
    return this.http.get<Discount[]>(`${this.base}/applicable/${cartItemId}`);
  }

  getApplicableDiscountsForProduct(productId: string, packageId?: string | null): Observable<Discount[]> {
    let params = new HttpParams().set('product_id', productId);
    if (packageId) params = params.set('package_id', packageId);
    return this.http.get<Discount[]>(`${this.base}/applicable-for-product`, { params });
  }

  getPendingNotifications(limit = 20): Observable<DiscountNotificationResponse> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<DiscountNotificationResponse>(`${this.base}/pending-for-approval`, { params });
  }

  expire(): Observable<{ expired: number }> {
    return this.http.post<{ expired: number }>(`${this.base}/expire`, {});
  }
}
