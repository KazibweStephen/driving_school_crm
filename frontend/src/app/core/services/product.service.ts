import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface Product {
  id: string;
  name: string;
  duration_label: string | null;
  description: string | null;
  is_extension: boolean;
  status: string;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
  packages: Package[];
}

export interface Package {
  id: string;
  product_id: string;
  name: string;
  price: number;
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
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  name: string;
  duration_label?: string;
  description?: string;
  is_extension?: boolean;
}

export interface ProductUpdate {
  name?: string;
  duration_label?: string;
  description?: string;
  status?: string;
  is_extension?: boolean;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PackageWithRateCreate extends PackageCreate {
  rate_total_amount?: number;
  rate_converter_pct?: number;
  rate_primary_recommender_pct?: number;
  rate_secondary_recommender_pct?: number;
  rate_active_from?: string;
  rate_active_until?: string;
  rate_notes?: string;
}

export interface PackageCreate {
  product_id: string;
  name: string;
  price: number;
  duration_label?: string;
  requires_driving_training?: boolean;
  requires_theory_training?: boolean;
  requires_permit_processing?: boolean;
  driving_training_duration_days?: number | null;
  theory_training_hours?: number | null;
  permit_processing_duration_days?: number | null;
  is_extension?: boolean;
  extension_days?: number | null;
}

export interface PackageUpdate {
  name?: string;
  price?: number;
  duration_label?: string;
  status?: string;
  requires_driving_training?: boolean;
  requires_theory_training?: boolean;
  requires_permit_processing?: boolean;
  driving_training_duration_days?: number | null;
  theory_training_hours?: number | null;
  permit_processing_duration_days?: number | null;
  is_extension?: boolean;
  extension_days?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private http: HttpClient) {}

  listProducts(params?: {
    search?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }) {
    let httpParams = new HttpParams();
    if (params) {
      if (params.search) httpParams = httpParams.set('search', params.search);
      if (params.status) httpParams = httpParams.set('status', params.status);
      if (params.page) httpParams = httpParams.set('page', params.page);
      if (params.page_size) httpParams = httpParams.set('page_size', params.page_size);
    }
    return this.http.get<ProductListResponse>('/api/v1/products/', { params: httpParams });
  }

  getProduct(id: string) {
    return this.http.get<Product>(`/api/v1/products/${id}`);
  }

  createProduct(data: ProductCreate) {
    return this.http.post<Product>('/api/v1/products/', data);
  }

  updateProduct(id: string, data: ProductUpdate) {
    return this.http.patch<Product>(`/api/v1/products/${id}`, data);
  }

  deactivateProduct(id: string) {
    return this.http.delete<Product>(`/api/v1/products/${id}`);
  }

  createPackage(data: PackageCreate) {
    return this.http.post<Package>('/api/v1/packages/', data);
  }

  createPackageWithRate(data: PackageWithRateCreate) {
    return this.http.post<Package>('/api/v1/packages/with-rate', data);
  }

  updatePackage(id: string, data: PackageUpdate) {
    return this.http.patch<Package>(`/api/v1/packages/${id}`, data);
  }

  deactivatePackage(id: string) {
    return this.http.delete<Package>(`/api/v1/packages/${id}`);
  }
}
