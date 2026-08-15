import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface CartItem {
  id: string;
  consultation_id: string;
  product_id: string;
  package_id: string | null;
  status: string;
  notes: string | null;
  is_important: boolean;
  recovery_reason: string | null;
  created_at: string;
  updated_at: string;
  product_name?: string;
  package_name?: string;
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
  start_date: string | null;
  document_date: string | null;
  notes: string | null;
  status: string;
  branch_id: string | null;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
  follow_ups: unknown[];
  cart_items?: CartItem[];
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

export interface FullConsultationItem {
  product_id: string;
  package_id?: string;
  allocation: number;
  installments: { due_date: string; amount: number }[];
  discount_id?: string;
}

export interface FollowUpCreate {
  follow_up_date: string;
  note?: string;
  type?: 'conversion' | 'payment';
  cart_item_ids?: string[];
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
  document_date?: string;
  notes?: string;
  branch_id?: string | null;
  items: FullConsultationItem[];
  payment?: { receipt_number?: string };
  follow_up?: FollowUpCreate;
  converter_id?: string;
  primary_recommender_id?: string;
  secondary_recommender_id?: string;
}

export interface ClientActiveProduct {
  cart_item_id: string;
  product_id: string;
  product_name: string;
  package_id: string | null;
  package_name: string | null;
  status: string;
  total: string;
  paid: string;
  balance: string;
  commission_earned: string;
  commission_total: string;
}

export interface ClientSummary {
  id: string;
  phone: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  location: string | null;
  interest_level: string | null;
  active_products_count: number;
  upgradable_products_count: number;
  total_paid: string;
  last_payment_date: string | null;
  created_at: string;
  products?: ClientActiveProduct[];
}

export interface ClientListResponse {
  clients: ClientSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ConsultationListResponse {
  consultations: Consultation[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

@Injectable({ providedIn: 'root' })
export class ConsultationService {
  constructor(private http: HttpClient) {}

  clientSearch(search: string) {
    const params = new HttpParams().set('search', search);
    return this.http.get<ClientInfo[]>('/api/v1/consultations/client-search', { params });
  }

  list(params?: { search?: string; page?: number; page_size?: number }) {
    let hp = new HttpParams();
    if (params?.search) hp = hp.set('search', params.search);
    if (params?.page) hp = hp.set('page', params.page);
    if (params?.page_size) hp = hp.set('page_size', params.page_size);
    return this.http.get<ConsultationListResponse>('/api/v1/consultations/', { params: hp });
  }

  listClients(params?: { search?: string; page?: number; page_size?: number; outstanding_only?: boolean }) {
    let hp = new HttpParams();
    if (params?.search) hp = hp.set('search', params.search);
    if (params?.page) hp = hp.set('page', params.page);
    if (params?.page_size) hp = hp.set('page_size', params.page_size);
    if (params?.outstanding_only) hp = hp.set('outstanding_only', 'true');
    return this.http.get<ClientListResponse>('/api/v1/clients/', { params: hp });
  }

  deleteCartItem(itemId: string) {
    return this.http.delete(`/api/v1/cart-items/${itemId}`);
  }

  get(id: string) {
    return this.http.get<Consultation>(`/api/v1/consultations/${id}`);
  }

  createFull(data: FullConsultationCreate) {
    return this.http.post<Consultation>('/api/v1/consultations/full', data);
  }

  addCartItem(
    consultationId: string,
    data: {
      product_id: string;
      package_id?: string;
      notes?: string;
      converter_id?: string;
      primary_recommender_id?: string;
      secondary_recommender_id?: string;
    },
  ) {
    return this.http.post<CartItem>(`/api/v1/consultations/${consultationId}/cart-items`, data);
  }

  updateCartItem(
    itemId: string,
    data: {
      status?: string;
      notes?: string;
      converter_id?: string;
      primary_recommender_id?: string;
      secondary_recommender_id?: string;
    },
  ) {
    return this.http.patch<CartItem>(`/api/v1/cart-items/${itemId}`, data);
  }

  createFollowUp(consultationId: string, data: FollowUpCreate) {
    return this.http.post(`/api/v1/consultations/${consultationId}/follow-ups`, data);
  }
}
