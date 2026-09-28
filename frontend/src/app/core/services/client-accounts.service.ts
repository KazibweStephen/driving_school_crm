import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ClientAccount {
  consultation_id: string;
  client_name: string | null;
  client_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  client_paid: number;
  posted: number;
  unpaid_posted: number;
  permit_paid: number;
  permit_unpaid: number;
  remitted: number;
  funded_in: number;
  funded_out: number;
  remaining: number;
  overdrawn: boolean;
  /** What the client still has to pay on their own expenses. Kept back when
   *  this client is used as a funding source. */
  required: number;
  funding_needed: number;
  /** Surplus over `required` — the only amount this client can give away. */
  available_to_fund: number;
}

export interface ClientAccountsResponse {
  items: ClientAccount[];
  total: number;
  totals: {
    client_paid: number;
    posted: number;
    remitted: number;
    funded_in: number;
    funded_out: number;
    remaining: number;
    required: number;
    funding_needed: number;
    available_to_fund: number;
  };
}

export interface ClientAccountFunding {
  id: string;
  branch_id: string;
  branch_name: string | null;
  from_consultation_id: string;
  from_client_name: string | null;
  from_client_phone: string | null;
  to_consultation_id: string;
  to_client_name: string | null;
  to_client_phone: string | null;
  amount: number;
  reason: string | null;
  status: string;
  initiated_by: string | null;
  initiated_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface ClientAccountFundingsResponse {
  items: ClientAccountFunding[];
  total: number;
}

export interface FundClientAccountAllocation {
  to_consultation_id: string;
  amount: number;
}

export interface FundClientAccountPayload {
  from_consultation_id: string;
  /** Preferred: several recipients funded in one atomic request. */
  allocations?: FundClientAccountAllocation[];
  /** Legacy single-recipient form. */
  to_consultation_id?: string;
  amount?: number;
  reason?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientAccountsService {
  private http = inject(HttpClient);
  private base = '/api/v1/finance';

  list(params: {
    branch_id?: string | null;
    branch_ids?: string | null;
    search?: string | null;
    only_overdrawn?: boolean;
  } = {}): Observable<ClientAccountsResponse> {
    let q = new HttpParams();
    if (params.branch_id) q = q.set('branch_id', params.branch_id);
    if (params.branch_ids) q = q.set('branch_ids', params.branch_ids);
    if (params.search) q = q.set('search', params.search);
    if (params.only_overdrawn) q = q.set('only_overdrawn', 'true');
    return this.http.get<ClientAccountsResponse>(`${this.base}/client-accounts`, { params: q });
  }

  fundings(branch_id?: string | null): Observable<ClientAccountFundingsResponse> {
    let q = new HttpParams();
    if (branch_id) q = q.set('branch_id', branch_id);
    return this.http.get<ClientAccountFundingsResponse>(`${this.base}/client-accounts/fundings`, { params: q });
  }

  fund(payload: FundClientAccountPayload): Observable<any> {
    return this.http.post(`${this.base}/client-accounts/fund`, payload);
  }

  cancelFunding(id: string, reason?: string | null): Observable<any> {
    return this.http.post(`${this.base}/client-accounts/fundings/${id}/cancel`, { reason: reason ?? null });
  }
}
