import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { CartItemRead } from './cart.service';

export interface InterestedProduct {
  product_id?: string;
  product_name?: string;
  package_id?: string;
  package_name?: string;
  status?: string;
}

export interface FollowUp {
  id: string;
  consultation_id: string;
  follow_up_date: string;
  note: string | null;
  status: string;
  type: string;
  cart_item_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Consultation {
  id: string;
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  location: string | null;
  how_they_knew_us: string | null;
  interest_level: string | null;
  interested_products: InterestedProduct[] | null;
  start_date: string | null;
  notes: string | null;
  status: string;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
  follow_ups: FollowUp[];
  cart_items?: CartItemRead[];
}

export interface ClientInfo {
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  location: string | null;
  how_they_knew_us: string | null;
  interest_level: string | null;
  latest_status: string | null;
  latest_consultation_id: string | null;
}

export interface ConsultationCreate {
  phone: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  location?: string;
  how_they_knew_us?: string;
  interest_level?: string;
  start_date?: string;
  notes?: string;
  branch_id?: string | null;
}

export interface FullConsultationItem {
  product_id: string;
  package_id?: string;
  allocation: number;
}

export interface FullConsultationPayment {
  receipt_number?: string;
}

export interface FullConsultationCreate {
  phone: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  location?: string;
  how_they_knew_us?: string;
  interest_level?: string;
  start_date?: string;
  notes?: string;
  branch_id?: string | null;
  items: FullConsultationItem[];
  payment?: FullConsultationPayment;
}

export interface ConsultationUpdate {
  phone?: string;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string | null;
  location?: string | null;
  how_they_knew_us?: string | null;
  interest_level?: string | null;
  interested_products?: InterestedProduct[] | null;
  start_date?: string | null;
  notes?: string | null;
  status?: string;
  branch_id?: string | null;
}

export interface ConsultationListResponse {
  consultations: Consultation[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FollowUpCreate {
  follow_up_date: string;
  note?: string;
  type?: string;
  cart_item_ids?: string[];
}

export interface FollowUpUpdate {
  follow_up_date?: string;
  note?: string;
  status?: string;
  type?: string;
  cart_item_ids?: string[];
}

export interface BulkOnboardingLesson {
  date: string;
  duration_minutes: number;
  lesson_type: string;
  instructor_id?: string;
  vehicle_id?: string;
  notes?: string;
}

export interface BulkOnboardingInstallment {
  receipt_number: string;
  document_date: string;
  amount: number;
  received_by_phone: string;
}

export interface BulkOnboardingPackage {
  product_id: string;
  package_id?: string;
  installments: BulkOnboardingInstallment[];
  lessons: BulkOnboardingLesson[];
}

export interface BulkOnboardingClient {
  phone: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  location?: string;
  branch_id?: string;
  document_date?: string;
  packages: BulkOnboardingPackage[];
}

export interface BulkOnboardingRequest {
  clients: BulkOnboardingClient[];
}

export interface BulkOnboardingResponse {
  created: number;
  consultation_ids: string[];
}

@Injectable({ providedIn: 'root' })
export class ConsultationService {
  constructor(private http: HttpClient) {}

  list(params?: { search?: string; status?: string; stage?: string; page?: number; page_size?: number }) {
    let hp = new HttpParams();
    if (params) {
      if (params.search) hp = hp.set('search', params.search);
      if (params.status) hp = hp.set('status', params.status);
      if (params.stage) hp = hp.set('stage', params.stage);
      if (params.page) hp = hp.set('page', params.page);
      if (params.page_size) hp = hp.set('page_size', params.page_size);
    }
    return this.http.get<ConsultationListResponse>('/api/v1/consultations/', { params: hp });
  }

  clientSearch(search: string) {
    return this.http.get<ClientInfo[]>('/api/v1/consultations/client-search', { params: { search } });
  }

  get(id: string) {
    return this.http.get<Consultation>(`/api/v1/consultations/${id}`);
  }

  create(data: ConsultationCreate) {
    return this.http.post<Consultation>('/api/v1/consultations/', data);
  }

  createFull(data: FullConsultationCreate) {
    return this.http.post<Consultation>('/api/v1/consultations/full', data);
  }

  update(id: string, data: ConsultationUpdate) {
    return this.http.patch<Consultation>(`/api/v1/consultations/${id}`, data);
  }

  deactivate(id: string) {
    return this.http.delete<Consultation>(`/api/v1/consultations/${id}`);
  }

  createFollowUp(consultationId: string, data: FollowUpCreate) {
    return this.http.post<FollowUp>(`/api/v1/consultations/${consultationId}/follow-ups`, data);
  }

  updateFollowUp(id: string, data: FollowUpUpdate) {
    return this.http.patch<FollowUp>(`/api/v1/consultations/follow-ups/${id}`, data);
  }

  deactivateFollowUp(id: string) {
    return this.http.delete<FollowUp>(`/api/v1/consultations/follow-ups/${id}`);
  }

  bulkOnboard(data: BulkOnboardingRequest) {
    return this.http.post<BulkOnboardingResponse>('/api/v1/bulk-onboarding', data);
  }

  checkBulkReceipts(receiptNumbers: string[]) {
    return this.http.post<{ existing: string[] }>('/api/v1/bulk-onboarding/check-receipts', {
      receipt_numbers: receiptNumbers,
    });
  }
}
