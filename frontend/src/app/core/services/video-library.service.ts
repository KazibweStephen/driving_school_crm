import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface VideoLibraryItem {
  id: string;
  title: string;
  description?: string;
  source: string;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  qr_code_data: string | null;
  created_by_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoLibraryCreate {
  title: string;
  source: string;
  url?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  qr_code_data?: string;
}

export interface VideoLibraryUpdate {
  title?: string;
  source?: string;
  url?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  qr_code_data?: string;
}

@Injectable({ providedIn: 'root' })
export class VideoLibraryService {
  constructor(private http: HttpClient) {}

  list(params?: { source?: string; search?: string }) {
    return this.http.get<VideoLibraryItem[]>('/api/v1/video-library', { params });
  }

  get(id: string) {
    return this.http.get<VideoLibraryItem>(`/api/v1/video-library/${id}`);
  }

  create(data: VideoLibraryCreate, lessonId?: string) {
    let params: any = {};
    if (lessonId) params.lesson_id = lessonId;
    return this.http.post<VideoLibraryItem>('/api/v1/video-library', data, { params });
  }

  upload(formData: FormData) {
    return this.http.post<VideoLibraryItem>('/api/v1/video-library/upload', formData);
  }

  update(id: string, data: VideoLibraryUpdate) {
    return this.http.patch<VideoLibraryItem>(`/api/v1/video-library/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/v1/video-library/${id}`);
  }

  getStreamUrl(id: string): string {
    return `/api/v1/video-library/${id}/stream`;
  }
}
