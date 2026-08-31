import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OperatingSummary {
  balance: number;
  equity: number;
  loans_outstanding: number;
  loans_received: number;
  profit: number;
  branch_funding_out: number;
  operating_expenses: number;
}

export interface OperatingEntry {
  id: string;
  company_id: string;
  branch_id: string | null;
  entry_type: string;
  direction: string;
  amount: number;
  description: string;
  reference: string | null;
  entry_date: string | null;
  loan_entry_id: string | null;
  transfer_id: string | null;
  target_pool: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface OperatingEntryCreate {
  entry_type: string;
  amount: number;
  description: string;
  reference?: string | null;
  entry_date?: string | null;
}

export interface OperatingFundBranch {
  to_branch_id: string;
  pool: string;
  amount: number;
  description?: string | null;
  method?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OperatingService {
  private base = '/api/v1/operating';

  constructor(private http: HttpClient) {}

  getSummary(): Observable<OperatingSummary> {
    return this.http.get<OperatingSummary>(`${this.base}/summary`);
  }

  listEntries(limit = 200): Observable<OperatingEntry[]> {
    return this.http.get<OperatingEntry[]>(`${this.base}/entries`, { params: { limit: String(limit) } });
  }

  createEntry(data: OperatingEntryCreate): Observable<OperatingEntry> {
    return this.http.post<OperatingEntry>(`${this.base}/entries`, data);
  }

  fundBranch(data: OperatingFundBranch): Observable<any> {
    return this.http.post<any>(`${this.base}/fund-branch`, data);
  }

  repayLoan(loanEntryId: string, amount: number, description?: string | null): Observable<OperatingEntry> {
    return this.http.post<OperatingEntry>(`${this.base}/repay-loan`, {
      loan_entry_id: loanEntryId,
      amount,
      description,
    });
  }
}
