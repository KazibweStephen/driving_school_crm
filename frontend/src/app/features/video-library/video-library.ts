import { Component, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LessonLibraryService, LessonLibrary } from '../../core/services/lesson-library.service';
import { VideoLibraryService, VideoLibraryItem } from '../../core/services/video-library.service';

@Component({
  selector: 'app-video-library',
  imports: [
    FormsModule, ButtonModule, DialogModule,
    InputTextModule, TagModule, TooltipModule,
    ToastModule, ConfirmDialogModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './video-library.html',
})
export class VideoLibraryCmp implements OnInit {
  lessons = signal<LessonLibrary[]>([]);
  loading = signal(false);

  showUploadDialog = signal(false);
  showEmbedDialog = signal(false);
  showPreview = signal(false);
  selectedVideo = signal<VideoLibraryItem | null>(null);
  uploading = signal(false);
  targetLesson = signal<LessonLibrary | null>(null);

  uploadFile: File | null = null;
  embedUrl = '';
  embedTitle = '';
  search = '';

  constructor(
    private lessonLibraryService: LessonLibraryService,
    private videoLibraryService: VideoLibraryService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.loadLessons();
  }

  async loadLessons() {
    this.loading.set(true);
    try {
      const params: any = {};
      if (this.search) params.search = this.search;
      const res = await this.lessonLibraryService.list(params).toPromise();
      this.lessons.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load lessons' });
    } finally {
      this.loading.set(false);
    }
  }

  onSearch() { this.loadLessons(); }

  openPreview(video: VideoLibraryItem) {
    this.selectedVideo.set(video);
    this.showPreview.set(true);
  }

  openUpload(lesson: LessonLibrary) {
    this.targetLesson.set(lesson);
    this.uploadFile = null;
    this.showUploadDialog.set(true);
  }

  openEmbed(lesson: LessonLibrary) {
    this.targetLesson.set(lesson);
    this.embedUrl = '';
    this.embedTitle = '';
    this.showEmbedDialog.set(true);
  }

  onFileSelected(event: any) {
    this.uploadFile = event.target?.files?.[0] || null;
  }

  async uploadVideo() {
    if (!this.uploadFile || !this.targetLesson()) return;
    const lesson = this.targetLesson()!;
    this.uploading.set(true);
    try {
      const formData = new FormData();
      formData.append('title', this.uploadFile.name);
      formData.append('lesson_id', lesson.id);
      formData.append('file', this.uploadFile);
      await this.videoLibraryService.upload(formData).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Uploaded', detail: 'Video attached to lesson' });
      this.showUploadDialog.set(false);
      await this.loadLessons();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Upload failed' });
    } finally {
      this.uploading.set(false);
    }
  }

  async addEmbedLink() {
    if (!this.embedUrl || !this.embedTitle || !this.targetLesson()) return;
    const lesson = this.targetLesson()!;
    this.uploading.set(true);
    try {
      const source = this.embedUrl.includes('youtube') || this.embedUrl.includes('youtu.be') ? 'youtube' : 'vimeo';
      await this.videoLibraryService.create({
        title: this.embedTitle,
        source: source,
        url: this.embedUrl,
      }, lesson.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Video link attached to lesson' });
      this.showEmbedDialog.set(false);
      await this.loadLessons();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add link' });
    } finally {
      this.uploading.set(false);
    }
  }

  async detachVideo(lesson: LessonLibrary, video: VideoLibraryItem) {
    try {
      await this.lessonLibraryService.detachVideo(lesson.id, video.id).toPromise();
      this.messageService.add({ severity: 'info', summary: 'Removed', detail: 'Video detached from lesson' });
      await this.loadLessons();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to detach video' });
    }
  }

  async deleteVideo(video: VideoLibraryItem) {
    try {
      await this.videoLibraryService.delete(video.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Video deleted' });
      await this.loadLessons();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete video' });
    }
  }

  getSourceIcon(type: string): string {
    switch (type) {
      case 'upload': return 'pi pi-video';
      case 'youtube': return 'pi pi-youtube';
      case 'vimeo': return 'pi pi-vimeo';
      default: return 'pi pi-file';
    }
  }

  getSourceColor(type: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (type) {
      case 'upload': return 'info';
      case 'youtube': return 'danger';
      case 'vimeo': return 'info';
      default: return 'info';
    }
  }

  getThumbnailUrl(video: VideoLibraryItem): string | null {
    if (video.source === 'youtube' && video.url) {
      const match = video.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
    }
    return null;
  }

  getVideoUrl(video: VideoLibraryItem): string {
    return video.url || `/api/v1/video-library/${video.id}/stream`;
  }

  getEmbedUrl(url: string): string {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return url;
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.getEmbedUrl(url));
  }

  // ── Resume playback helpers ──

  saveResumeTime(id: string, event: Event) {
    const video = event.target as HTMLVideoElement;
    if (video.currentTime > 5) {
      localStorage.setItem(`videoResume_${id}`, String(video.currentTime));
    }
  }

  restoreResumeTime(event: Event, id: string) {
    const saved = localStorage.getItem(`videoResume_${id}`);
    if (saved) {
      (event.target as HTMLVideoElement).currentTime = parseFloat(saved);
    }
  }

  clearResumeTime(id: string) {
    localStorage.removeItem(`videoResume_${id}`);
  }

  onVideoSeeking(id: string, event: Event) {
    if ((event.target as HTMLVideoElement).currentTime < 1) {
      localStorage.removeItem(`videoResume_${id}`);
    }
  }
}
