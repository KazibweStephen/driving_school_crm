import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Company {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyCreate {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
}

export interface CompanyUpdate {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
  is_active?: boolean;
}

export interface Branch {
  id: string;
  company_id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BranchCreate {
  company_id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface BranchUpdate {
  name?: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

export interface UserBranchAssignment {
  id: string;
  user_id: string;
  branch_id: string;
  role?: string;
  created_at: string;
}

export interface VehicleBranchAssignment {
  id: string;
  vehicle_id: string;
  branch_id: string;
  created_at: string;
}

export interface Expense {
  id: string;
  branch_id: string;
  amount: number;
  description?: string;
  category?: string;
  expense_date: string;
  created_by_phone?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  branch_id: string;
  consultation_id?: string;
  amount: number;
  description?: string;
  sale_date: string;
  created_by_phone?: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private base = '/api/v1/companies';

  constructor(private http: HttpClient) {}

  list(): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.base}/`);
  }

  get(id: string): Observable<Company> {
    return this.http.get<Company>(`${this.base}/${id}`);
  }

  create(data: CompanyCreate): Observable<Company> {
    return this.http.post<Company>(`${this.base}/`, data);
  }

  update(id: string, data: CompanyUpdate): Observable<Company> {
    return this.http.patch<Company>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  listBranches(companyId: string): Observable<Branch[]> {
    return this.http.get<Branch[]>(`${this.base}/${companyId}/branches`);
  }

  getBranch(id: string): Observable<Branch> {
    return this.http.get<Branch>(`${this.base}/branches/${id}`);
  }

  createBranch(companyId: string, data: { name: string; code: string; address?: string; phone?: string; email?: string }): Observable<Branch> {
    return this.http.post<Branch>(`${this.base}/${companyId}/branches`, data);
  }

  updateBranch(id: string, data: BranchUpdate): Observable<Branch> {
    return this.http.patch<Branch>(`${this.base}/branches/${id}`, data);
  }

  deleteBranch(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/branches/${id}`);
  }

  assignUser(branchId: string, data: { user_id: string; role?: string }): Observable<UserBranchAssignment> {
    return this.http.post<UserBranchAssignment>(`${this.base}/branches/${branchId}/assign-user`, data);
  }

  removeUserAssignment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/branch-assignments/${id}`);
  }

  assignVehicle(branchId: string, data: { vehicle_id: string }): Observable<VehicleBranchAssignment> {
    return this.http.post<VehicleBranchAssignment>(`${this.base}/branches/${branchId}/assign-vehicle`, data);
  }

  removeVehicleAssignment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/branch-vehicle-assignments/${id}`);
  }

  listExpenses(branchId: string): Observable<Expense[]> {
    return this.http.get<Expense[]>(`${this.base}/branches/${branchId}/expenses`);
  }

  listSales(branchId: string): Observable<Sale[]> {
    return this.http.get<Sale[]>(`${this.base}/branches/${branchId}/sales`);
  }
}
