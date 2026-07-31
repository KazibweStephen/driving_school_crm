import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PermissionGroup {
  key: string;
  label: string;
  codes: string[];
}

export interface CompanyMatrix {
  company_id: string;
  matrix: Record<string, string[]>;
}

export interface RolePermissions {
  role: string;
  permissions: string[];
}

export const ROLE_LABELS: Record<string, string> = {
  super_user: 'Super Admin',
  company_super_user: 'Company Super User',
  manager: 'Manager',
  branch_supervisor: 'Branch Supervisor',
  supervisor: 'Supervisor',
  office_admin: 'Office Admin',
  instructor: 'Instructor',
  reception: 'Reception',
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private http: HttpClient) {}

  catalog(): Observable<PermissionGroup[]> {
    return this.http.get<PermissionGroup[]>('/api/v1/permissions/catalog');
  }

  matrix(companyId?: string): Observable<CompanyMatrix> {
    let params = new HttpParams();
    if (companyId) params = params.set('company_id', companyId);
    return this.http.get<CompanyMatrix>('/api/v1/permissions/matrix', { params });
  }

  rolePermissions(role: string, companyId?: string): Observable<RolePermissions> {
    let params = new HttpParams();
    if (companyId) params = params.set('company_id', companyId);
    return this.http.get<RolePermissions>(`/api/v1/permissions/role/${role}`, { params });
  }

  updateRole(role: string, permissions: string[], companyId?: string): Observable<RolePermissions> {
    let params = new HttpParams();
    if (companyId) params = params.set('company_id', companyId);
    return this.http.put<RolePermissions>(`/api/v1/permissions/matrix/${role}`, { permissions }, { params });
  }
}
