import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Vehicle {
  id: string;
  name: string;
  plate_number: string;
  transmission: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreate {
  name: string;
  plate_number: string;
  transmission: string;
  notes?: string;
}

export interface VehicleUpdate {
  name?: string;
  plate_number?: string;
  transmission?: string;
  status?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  constructor(private http: HttpClient) {}

  list(params?: { status?: string; transmission?: string }) {
    return this.http.get<Vehicle[]>('/api/v1/vehicles', { params });
  }

  get(id: string) {
    return this.http.get<Vehicle>(`/api/v1/vehicles/${id}`);
  }

  create(data: VehicleCreate) {
    return this.http.post<Vehicle>('/api/v1/vehicles', data);
  }

  update(id: string, data: VehicleUpdate) {
    return this.http.patch<Vehicle>(`/api/v1/vehicles/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/v1/vehicles/${id}`);
  }
}
