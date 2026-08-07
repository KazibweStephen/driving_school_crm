import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface SmsTemplate {
  id: string;
  company_id: string;
  name: string;
  category: string;
  trigger_event: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmsLog {
  id: string;
  company_id: string;
  phone: string;
  message: string;
  status: string;
  sms_units: number;
  cost: number;
  sent_at: string;
}

export interface SmsLogListResponse {
  logs: SmsLog[];
  total: number;
  total_units: number;
  total_cost: number;
}

@Injectable({ providedIn: 'root' })
export class SmsService {
  private base = '/api/v1/sms';

  constructor(private http: HttpClient) {}

  listTemplates(companyId: string) {
    return this.http.get<SmsTemplate[]>(`${this.base}/templates/${companyId}`);
  }

  sendSms(companyId: string, phone: string, message: string) {
    return this.http.post<{ message: string }>(`${this.base}/send/${companyId}`, {
      phone,
      message,
    });
  }

  sendTemplateSms(companyId: string, phone: string, category: string) {
    return this.http.post<{ message: string }>(`${this.base}/send-template/${companyId}`, {
      phone,
      category,
      variables: {},
    });
  }

  listLogs(companyId: string, phone?: string, page = 1, pageSize = 20) {
    const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    if (phone) params['phone'] = phone;
    return this.http.get<SmsLogListResponse>(`${this.base}/logs/${companyId}`, { params });
  }
}
