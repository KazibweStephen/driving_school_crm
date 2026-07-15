import { Component, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LessonLibraryService, LessonLibrary } from '../../core/services/lesson-library.service';
import { VideoLibraryService, VideoLibraryItem } from '../../core/services/video-library.service';
import { CompetencyCatalogueService, CompetencySearchResult } from '../../core/services/competency-catalogue.service';

@Component({
  selector: 'app-lesson-library',
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule,
    InputTextModule, InputNumberModule, TagModule, TooltipModule,
    ToastModule, SelectModule, CheckboxModule, MultiSelectModule, ConfirmDialogModule, TableModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './lesson-library.html',
})
export class LessonLibraryCmp implements OnInit {
  lessons = signal<LessonLibrary[]>([]);
  loading = signal(false);
  showDialog = signal(false);
  editingLesson = signal<LessonLibrary | null>(null);
  search = signal('');
  allLessons = signal<LessonLibrary[]>([]);

  // Competency picker data
  availableCompetencies = signal<CompetencySearchResult[]>([]);
  selectedCompetencyIds = signal<string[]>([]);

  form: any = {
    title: '',
    description: '',
    transmission_type: null,
    lesson_objectives: [''] as string[],
    practical_objectives: [''] as string[],
    estimated_minutes: 30,
    estimated_distance_km: 3.0,
    difficulty: 'beginner',
    day_number: null,
    week_number: null,
    order: null,
    preferred_location: '',
    training_category: 'driving',
    prerequisite_lesson_ids: [] as string[],
    is_theory: false,
  };

  difficulties = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];

  transmissionTypes = [
    { label: 'Any', value: null },
    { label: 'Manual', value: 'manual' },
    { label: 'Automatic', value: 'automatic' },
    { label: 'Both', value: 'both' },
  ];

  trainingCategories = [
    { label: 'Driving', value: 'driving' },
    { label: 'Motorcycle', value: 'motorcycle' },
    { label: 'Truck', value: 'truck' },
    { label: 'Bus', value: 'bus' },
  ];

  constructor(
    private lessonLibraryService: LessonLibraryService,
    private videoLibraryService: VideoLibraryService,
    private competencyService: CompetencyCatalogueService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.loadLessons();
    this.loadCompetencies();
  }

  async loadCompetencies() {
    try {
      const results = await this.competencyService.searchCompetencies({}).toPromise();
      const mapped = (results || []).map(c => ({
        ...c,
        displayLabel: `${c.code} - ${c.name}`,
        categoryName: c.category_name || '',
      }));
      this.availableCompetencies.set(mapped);
    } catch {}
  }

  async loadLessons() {
    this.loading.set(true);
    try {
      const params: any = {};
      if (this.search()) params.search = this.search();
      const res = await this.lessonLibraryService.list(params).toPromise();
      this.lessons.set(res || []);
      // Load full list for prerequisite multi-select
      const all = await this.lessonLibraryService.list().toPromise();
      this.allLessons.set(all || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load lessons' });
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editingLesson.set(null);
    this.resetForm();
    this.currentVideos.set([]);
    this.lessonIdForVideo = null;
    this.showDialog.set(true);
  }

  openEdit(lesson: LessonLibrary) {
    this.editingLesson.set(lesson);
    this.form = {
      title: lesson.title,
      description: lesson.description || '',
      transmission_type: lesson.transmission_type,
      lesson_objectives: lesson.lesson_objectives?.length ? [...lesson.lesson_objectives] : [''],
      practical_objectives: lesson.practical_objectives?.length ? [...lesson.practical_objectives] : [''],
      estimated_minutes: lesson.estimated_minutes,
      estimated_distance_km: lesson.estimated_distance_km,
      difficulty: lesson.difficulty,
      day_number: lesson.day_number,
      week_number: lesson.week_number,
      order: lesson.order,
      preferred_location: lesson.preferred_location || '',
      training_category: lesson.training_category || 'driving',
      prerequisite_lesson_ids: lesson.prerequisite_lessons?.map(p => p.id) || [],
      is_theory: lesson.is_theory,
    };
    this.selectedCompetencyIds.set(lesson.competency_links?.map(c => c.competency_id) || []);
    this.currentVideos.set(lesson.videos || []);
    this.lessonIdForVideo = lesson.id;
    this.showDialog.set(true);
  }

  resetForm() {
    this.form = {
      title: '', description: '', transmission_type: null,
      lesson_objectives: [''], practical_objectives: [''],
      estimated_minutes: 30, estimated_distance_km: 3.0,
      difficulty: 'beginner', day_number: null, week_number: null, order: null,
      preferred_location: '', training_category: 'driving',
      prerequisite_lesson_ids: [],
      is_theory: false,
    };
    this.selectedCompetencyIds.set([]);
  }

  addArrayItem(key: string) {
    this.form[key] = [...(this.form[key] || []), ''];
  }
  removeArrayItem(key: string, idx: number) {
    this.form[key] = (this.form[key] || []).filter((_: any, i: number) => i !== idx);
  }

  async save() {
    const editing = this.editingLesson();
    this.loading.set(true);
    try {
      const data: any = {
        title: this.form.title,
        description: this.form.description || undefined,
        transmission_type: this.form.transmission_type || undefined,
        lesson_objectives: this.form.lesson_objectives.filter((s: string) => s.trim()),
        practical_objectives: this.form.practical_objectives.filter((s: string) => s.trim()),
        competency_ids: this.selectedCompetencyIds(),
        estimated_minutes: this.form.estimated_minutes,
        estimated_distance_km: this.form.estimated_distance_km,
        difficulty: this.form.difficulty,
        day_number: this.form.day_number || undefined,
        week_number: this.form.week_number || undefined,
        order: this.form.order || undefined,
        preferred_location: this.form.preferred_location || undefined,
        training_category: this.form.training_category || undefined,
        prerequisite_lesson_ids: this.form.prerequisite_lesson_ids || undefined,
        is_theory: this.form.is_theory || false,
      };
      if (editing) {
        await this.lessonLibraryService.update(editing.id, data).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Lesson updated' });
      } else {
        await this.lessonLibraryService.create(data).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Lesson created' });
      }
      this.showDialog.set(false);
      await this.loadLessons();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${editing ? 'update' : 'create'} lesson` });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDelete(lesson: LessonLibrary) {
    this.confirmationService.confirm({
      message: `Delete "${lesson.title}"? This cannot be undone.`,
      header: 'Delete Lesson',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteLesson(lesson),
    });
  }

  async deleteLesson(lesson: LessonLibrary) {
    try {
      await this.lessonLibraryService.delete(lesson.id).toPromise();
      this.lessons.update(list => list.filter(l => l.id !== lesson.id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Lesson deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete lesson' });
    }
  }

  difficultyColor(d: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (d) {
      case 'beginner': return 'info';
      case 'intermediate': return 'warn';
      case 'advanced': return 'danger';
      default: return 'info';
    }
  }

  onSearch() { this.loadLessons(); }

  // ── Video management ──

  currentVideos = signal<VideoLibraryItem[]>([]);
  showVideoUpload = signal(false);
  showVideoEmbed = signal(false);
  showVideoPreview = signal(false);
  selectedVideo = signal<VideoLibraryItem | null>(null);
  videoUploading = signal(false);
  videoUploadFile: File | null = null;
  videoEmbedUrl = '';
  videoEmbedTitle = '';

  lessonIdForVideo: string | null = null;

  openVideoUpload() {
    this.videoUploadFile = null;
    this.showVideoUpload.set(true);
  }

  openVideoEmbed() {
    this.videoEmbedUrl = '';
    this.videoEmbedTitle = '';
    this.showVideoEmbed.set(true);
  }

  onVideoFileSelected(event: any) {
    this.videoUploadFile = event.target?.files?.[0] || null;
  }

  async uploadVideo() {
    if (!this.videoUploadFile || !this.lessonIdForVideo) return;
    this.videoUploading.set(true);
    try {
      const formData = new FormData();
      formData.append('title', this.videoUploadFile.name);
      formData.append('lesson_id', this.lessonIdForVideo);
      formData.append('file', this.videoUploadFile);
      await this.videoLibraryService.upload(formData).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Uploaded', detail: 'Video attached' });
      this.showVideoUpload.set(false);
      await this.refreshCurrentVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Upload failed' });
    } finally {
      this.videoUploading.set(false);
    }
  }

  async addVideoEmbedLink() {
    if (!this.videoEmbedUrl || !this.videoEmbedTitle || !this.lessonIdForVideo) return;
    this.videoUploading.set(true);
    try {
      const source = this.videoEmbedUrl.includes('youtube') || this.videoEmbedUrl.includes('youtu.be') ? 'youtube' : 'vimeo';
      await this.videoLibraryService.create({
        title: this.videoEmbedTitle,
        source: source,
        url: this.videoEmbedUrl,
      }, this.lessonIdForVideo).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Video link attached' });
      this.showVideoEmbed.set(false);
      await this.refreshCurrentVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add link' });
    } finally {
      this.videoUploading.set(false);
    }
  }

  async detachVideo(video: VideoLibraryItem) {
    if (!this.lessonIdForVideo) return;
    try {
      await this.lessonLibraryService.detachVideo(this.lessonIdForVideo, video.id).toPromise();
      this.messageService.add({ severity: 'info', summary: 'Removed', detail: 'Video detached' });
      await this.refreshCurrentVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to detach video' });
    }
  }

  async deleteVideo(video: VideoLibraryItem) {
    try {
      await this.videoLibraryService.delete(video.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Video deleted' });
      await this.refreshCurrentVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete video' });
    }
  }

  openVideoPreview(video: VideoLibraryItem) {
    this.selectedVideo.set(video);
    this.showVideoPreview.set(true);
  }

  private async refreshCurrentVideos() {
    if (!this.lessonIdForVideo) return;
    try {
      const lesson = await this.lessonLibraryService.get(this.lessonIdForVideo).toPromise();
      this.currentVideos.set(lesson?.videos || []);
    } catch {
      this.currentVideos.set([]);
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

  saveResumeTime(id: string, event: Event) {
    const video = event.target as HTMLVideoElement;
    if (video.currentTime > 5) {
      localStorage.setItem(`videoResume_${id}`, String(video.currentTime));
    }
  }

  restoreResumeTime(event: Event, id: string) {
    const saved = localStorage.getItem(`videoResume_${id}`);
    if (saved) (event.target as HTMLVideoElement).currentTime = parseFloat(saved);
  }
}
