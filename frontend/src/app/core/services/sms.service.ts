import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SmsSettings {
  id: string;
  company_id: string;
  is_active: boolean;
  provider: string;
  egosms_api_url: string;
  egosms_username: string;
  egosms_sender: string;
  twilio_account_sid: string;
  twilio_phone_number: string;
  rate_per_sms: number;
  created_at: string;
  updated_at: string;
}

export interface SmsSettingsUpdate {
  is_active?: boolean;
  provider?: string;
  egosms_api_url?: string;
  egosms_username?: string;
  egosms_password?: string;
  egosms_sender?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_phone_number?: string;
  rate_per_sms?: number;
}

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

export interface SmsTemplateCreate {
  name: string;
  category: string;
  trigger_event?: string;
  body: string;
  is_active?: boolean;
}

export interface SmsTemplateUpdate {
  name?: string;
  category?: string;
  trigger_event?: string;
  body?: string;
  is_active?: boolean;
}

export const SMS_TEMPLATE_CATEGORIES = [
  { label: 'PIN Creation / Reset', value: 'pin_creation_reset' },
  { label: 'Training Cancellation', value: 'training_cancellation' },
  { label: 'Lesson Reminder', value: 'lesson_reminder' },
  { label: 'Lesson Scheduling', value: 'lesson_scheduling' },
  { label: 'Branch Visit (Consultation)', value: 'branch_visit' },
  { label: 'Payment Receipt', value: 'payment_receipt' },
  { label: 'Payment Installment Reminder', value: 'payment_installment' },
  { label: 'Permit Expiring Soon', value: 'permit_expiring' },
  { label: 'Training Completed', value: 'training_completed' },
  { label: 'General', value: 'general' },
  { label: 'Custom', value: 'custom' },
];

export const SMS_TRIGGERS = [
  { label: 'Manual (No auto-trigger)', value: 'manual' },
  { label: 'User Created (sends PIN)', value: 'user_created' },
  { label: 'PIN Reset', value: 'pin_reset' },
  { label: 'Consultation Created', value: 'consultation_created' },
  { label: 'Payment Received', value: 'payment_received' },
  { label: 'Installment Due (reminder)', value: 'installment_due' },
  { label: 'Installment Overdue (dunning)', value: 'installment_overdue' },
  { label: 'Cart Item Converted', value: 'cart_item_converted' },
  { label: 'Expense Approved', value: 'expense_approved' },
  { label: 'Lesson Scheduled', value: 'lesson_scheduled' },
  { label: 'Lesson Cancelled', value: 'lesson_cancelled' },
  { label: 'Lesson Reminder', value: 'lesson_reminder' },
  { label: 'Training Completed', value: 'training_completed' },
  { label: 'Permit Expiring', value: 'permit_expiring' },
];

export const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  pin_creation_reset: ['name', 'pin'],
  training_cancellation: ['name', 'date', 'time', 'reason'],
  lesson_reminder: ['name', 'date', 'time', 'instructor'],
  lesson_scheduling: ['name', 'date', 'time', 'instructor'],
  branch_visit: ['name', 'date', 'time', 'branch', 'address'],
  payment_receipt: ['name', 'amount', 'receipt_number', 'download_url'],
  payment_installment: ['name', 'amount', 'due_date', 'balance', 'overdue_amount', 'days_overdue', 'total_balance'],
  permit_expiring: ['name', 'expiry_date', 'days_remaining'],
  general: ['name', 'message', 'description', 'amount', 'package', 'total_sessions'],
  training_completed: ['name', 'training_type', 'lesson_number'],
  custom: [],
};

export interface SmsLog {
  id: string;
  company_id: string;
  phone: string;
  message: string;
  message_length: number;
  provider: string;
  trigger_event: string | null;
  template_id: string | null;
  status: string;
  error_message: string | null;
  provider_response: string | null;
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

  getSettings(companyId: string): Observable<SmsSettings> {
    return this.http.get<SmsSettings>(`${this.base}/settings/${companyId}`);
  }

  upsertSettings(companyId: string, data: SmsSettingsUpdate): Observable<SmsSettings> {
    return this.http.put<SmsSettings>(`${this.base}/settings/${companyId}`, data);
  }

  testSms(companyId: string, phone: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/settings/${companyId}/test`, { phone });
  }

  listTemplates(companyId: string, category?: string): Observable<SmsTemplate[]> {
    const params: Record<string, string> = {};
    if (category) params['category'] = category;
    return this.http.get<SmsTemplate[]>(`${this.base}/templates/${companyId}`, { params });
  }

  getTemplate(templateId: string): Observable<SmsTemplate> {
    return this.http.get<SmsTemplate>(`${this.base}/templates/detail/${templateId}`);
  }

  createTemplate(companyId: string, data: SmsTemplateCreate): Observable<SmsTemplate> {
    return this.http.post<SmsTemplate>(`${this.base}/templates/${companyId}`, data);
  }

  updateTemplate(templateId: string, data: SmsTemplateUpdate): Observable<SmsTemplate> {
    return this.http.patch<SmsTemplate>(`${this.base}/templates/${templateId}`, data);
  }

  deleteTemplate(templateId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/templates/${templateId}`);
  }

  sendSms(companyId: string, phone: string, message: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/send/${companyId}`, { phone, message });
  }

  sendTemplateSms(companyId: string, phone: string, category: string, variables: Record<string, string> = {}): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/send-template/${companyId}`, { phone, category, variables });
  }

  listLogs(
    companyId: string,
    phone?: string,
    status?: string,
    triggerEvent?: string,
    page = 1,
    pageSize = 50,
  ): Observable<SmsLogListResponse> {
    const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    if (phone) params['phone'] = phone;
    if (status) params['status'] = status;
    if (triggerEvent) params['trigger_event'] = triggerEvent;
    return this.http.get<SmsLogListResponse>(`${this.base}/logs/${companyId}`, { params });
  }
}
