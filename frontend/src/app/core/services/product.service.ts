import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  commission_rate?: {
    id: string;
    total_amount: number;
    converter_pct: number;
    primary_recommender_pct: number;
    secondary_recommender_pct: number;
    active_from: string;
    active_until: string | null;
  } | null;
  expected_expenses?: {
    id: string;
    package_id: string;
    category: string;
    amount: string;
  }[];
}

export interface PackageExpectedExpenseInput {
  category: string;
  amount: number;
}

export interface ExpectedExpenseItem {
  id: string;
  company_id: string | null;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit_cost: number;
  default_multiplier: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpectedExpenseItemCreate {
  name: string;
  category_id?: string | null;
  unit_cost?: number;
  default_multiplier?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface ExpectedExpenseItemUpdate {
  name?: string;
  category_id?: string | null;
  unit_cost?: number;
  default_multiplier?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface PackageExpenseLinkLine {
  link_id: string;
  item_id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit_cost: number;
  multiplier: number;
  line_total: number;
}

export interface PackageExpectedExpenses {
  package_id: string;
  items: PackageExpenseLinkLine[];
  total: number;
}

export interface ExpenseCategoryOption {
  id: string;
  name: string;
  code: string;
  account: string | null;
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

export interface PackageWithRateUpdate extends PackageUpdate {
  rate_total_amount?: number;
  rate_converter_pct?: number;
  rate_primary_recommender_pct?: number;
  rate_secondary_recommender_pct?: number;
  rate_active_from?: string;
  rate_active_until?: string;
  rate_notes?: string;
  clear_rate?: boolean;
}

export interface CommissionRate {
  id: string;
  company_id: string;
  package_ids: string[];
  total_amount: number;
  converter_pct: number;
  primary_recommender_pct: number;
  secondary_recommender_pct: number;
  active_from: string;
  active_until: string | null;
  deactivated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  package_names: string[];
}

export interface CommissionRateCreate {
  package_ids: string[];
  total_amount: number;
  converter_pct: number;
  primary_recommender_pct: number;
  secondary_recommender_pct: number;
  active_from: string;
  active_until?: string;
  notes?: string;
}

export interface CommissionRateUpdate {
  package_ids?: string[];
  total_amount?: number;
  converter_pct?: number;
  primary_recommender_pct?: number;
  secondary_recommender_pct?: number;
  active_from?: string;
  active_until?: string;
  notes?: string;
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

  updatePackageWithRate(id: string, data: PackageWithRateUpdate) {
    return this.http.patch<Package>(`/api/v1/packages/${id}/with-rate`, data);
  }

  getPackageCommissionRate(id: string) {
    return this.http.get<CommissionRate | null>(`/api/v1/packages/${id}/commission-rate`);
  }

  deactivatePackage(id: string) {
    return this.http.delete<Package>(`/api/v1/packages/${id}`);
  }

  setPackageExpectedExpenses(packageId: string, data: PackageExpectedExpenseInput[]) {
    return this.http.post<Package>(`/api/v1/products/packages/${packageId}/expected-expenses`, data);
  }

  // ── Expected Expense Catalogue (replaces the legacy per-package flow) ──

  listExpectedExpenses(active?: boolean): Observable<ExpectedExpenseItem[]> {
    let p = new HttpParams();
    if (active !== undefined) p = p.set('active', active ? 'true' : 'false');
    return this.http.get<ExpectedExpenseItem[]>('/api/v1/expected-expenses/', { params: p });
  }

  createExpectedExpense(data: ExpectedExpenseItemCreate): Observable<ExpectedExpenseItem> {
    return this.http.post<ExpectedExpenseItem>('/api/v1/expected-expenses/', data);
  }

  updateExpectedExpense(id: string, data: ExpectedExpenseItemUpdate): Observable<ExpectedExpenseItem> {
    return this.http.patch<ExpectedExpenseItem>(`/api/v1/expected-expenses/${id}`, data);
  }

  deleteExpectedExpense(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/expected-expenses/${id}`);
  }

  getPackageExpectedExpenses(packageId: string): Observable<PackageExpectedExpenses> {
    return this.http.get<PackageExpectedExpenses>(`/api/v1/expected-expenses/package/${packageId}`);
  }

  setPackageExpectedExpensesCatalogue(packageId: string, links: { item_id: string; multiplier: number }[]): Observable<PackageExpectedExpenses> {
    return this.http.put<PackageExpectedExpenses>(`/api/v1/expected-expenses/package/${packageId}`, { links });
  }

  listExpectedExpenseCategories(): Observable<ExpenseCategoryOption[]> {
    return this.http.get<ExpenseCategoryOption[]>('/api/v1/expected-expenses/categories');
  }
}
