import { Component, computed, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LessonPlanService, LessonPlanTemplate, LessonTemplateItem } from '../../core/services/lesson-plan.service';
import { LessonLibraryService, LessonLibrary } from '../../core/services/lesson-library.service';
import { VideoLibraryService, VideoLibraryItem } from '../../core/services/video-library.service';

@Component({
  selector: 'app-lesson-plans',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    TagModule,
    TooltipModule,
    ToastModule,
    SelectModule,
    MultiSelectModule,
    CheckboxModule,
    ConfirmDialogModule,
    TableModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './lesson-plans.html',
})
export class LessonPlans implements OnInit {
  templates = signal<LessonPlanTemplate[]>([]);
  loading = signal(false);
  selectedTemplate = signal<LessonPlanTemplate | null>(null);

  showCreateDialog = signal(false);
  editingTemplate = signal<LessonPlanTemplate | null>(null);
  form: {
    name: string;
    transmission_type: string;
    description: string;
    total_days: number;
    total_weeks: number;
    items: {
      day_number: number;
      week_number: number;
      title: string;
      description?: string;
      transmission_type?: string | null;
      lesson_objectives: string[];
      practical_objectives: string[];
      competencies?: string[];
      estimated_minutes: number;
      estimated_distance_km: number;
      difficulty?: string;
      order: number;
      lesson_library_id?: string;
      preferred_location?: string;
      enforce_prerequisites?: boolean;
      training_category?: string;
      prerequisite_competencies?: string[];
      prerequisite_lesson_ids?: string[];
    }[];
  } = { name: '', transmission_type: 'manual', description: '', total_days: 20, total_weeks: 4, items: [] };

  // Item picker dialog
  showPicker = signal(false);
  editingItemIndex = signal(-1);
  pickerMode: 'library' | 'create' = 'library';
  libraryLessons = signal<LessonLibrary[]>([]);
  librarySearch = signal('');
  libraryLoading = signal(false);

  // Filter out lessons already added to the template
  availableLibraryLessons = computed(() => {
    const all = this.libraryLessons();
    const usedIds = new Set(this.form.items.map(i => i.lesson_library_id).filter(Boolean));
    return all.filter(l => !usedIds.has(l.id));
  });

  isLessonAdded(lessonId: string): boolean {
    return this.form.items.some(i => i.lesson_library_id === lessonId);
  }

  itemForm: {
    day_number: number;
    week_number: number;
    title: string;
    description: string;
    transmission_type: string | null;
    lesson_objectives: string[];
    practical_objectives: string[];
    competencies: string[];
    estimated_minutes: number;
    estimated_distance_km: number;
    difficulty: string;
    order: number;
    lesson_library_id: string | null;
    preferred_location: string;
    enforce_prerequisites: boolean;
    training_category: string;
    prerequisite_competencies: string[];
    prerequisite_lesson_ids: string[];
  } = {
    day_number: 1, week_number: 1, title: '', description: '', transmission_type: null,
    lesson_objectives: [''], practical_objectives: [''], competencies: [''],
    estimated_minutes: 30, estimated_distance_km: 3, difficulty: 'beginner',
    order: 1, lesson_library_id: null, preferred_location: '', enforce_prerequisites: true,
    training_category: 'driving', prerequisite_competencies: [''], prerequisite_lesson_ids: [],
  };

  difficulties = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];

  transmissionOpts = [
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

  allLibraryLessons = signal<LessonLibrary[]>([]);

  // ── Import ──
  showImportDialog = signal(false);
  importTab: 'paste' | 'upload' = 'paste';
  importJsonText = signal('');
  importFile: File | null = null;
  importLoading = signal(false);
  importResult = signal<{ valid: boolean; errors: any[]; warnings: any[] } | null>(null);
  importSuccess = signal(false);

  // Collapse state per template
  collapsedTpl = signal<Set<string>>(new Set());

  toggleCollapse(id: string) {
    const s = new Set(this.collapsedTpl());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.collapsedTpl.set(s);
  }

  isCollapsed(id: string): boolean {
    return this.collapsedTpl().has(id);
  }

  // ── Video management (item picker) ──

  currentItemVideos = signal<VideoLibraryItem[]>([]);
  showItemVideoUpload = signal(false);
  showItemVideoEmbed = signal(false);
  showItemVideoPreview = signal(false);
  selectedItemVideo = signal<VideoLibraryItem | null>(null);
  itemVideoUploading = signal(false);
  itemVideoUploadFile: File | null = null;
  itemVideoEmbedUrl = '';
  itemVideoEmbedTitle = '';

  openItemVideoUpload() {
    this.itemVideoUploadFile = null;
    this.showItemVideoUpload.set(true);
  }

  openItemVideoEmbed() {
    this.itemVideoEmbedUrl = '';
    this.itemVideoEmbedTitle = '';
    this.showItemVideoEmbed.set(true);
  }

  onItemVideoFileSelected(event: any) {
    this.itemVideoUploadFile = event.target?.files?.[0] || null;
  }

  async uploadItemVideo() {
    if (!this.itemVideoUploadFile || !this.itemForm.lesson_library_id) return;
    this.itemVideoUploading.set(true);
    try {
      const formData = new FormData();
      formData.append('title', this.itemVideoUploadFile.name);
      formData.append('lesson_id', this.itemForm.lesson_library_id);
      formData.append('file', this.itemVideoUploadFile);
      await this.videoLibraryService.upload(formData).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Uploaded', detail: 'Video attached' });
      this.showItemVideoUpload.set(false);
      await this.refreshItemVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Upload failed' });
    } finally {
      this.itemVideoUploading.set(false);
    }
  }

  async addItemVideoEmbedLink() {
    if (!this.itemVideoEmbedUrl || !this.itemVideoEmbedTitle || !this.itemForm.lesson_library_id) return;
    this.itemVideoUploading.set(true);
    try {
      const source = this.itemVideoEmbedUrl.includes('youtube') || this.itemVideoEmbedUrl.includes('youtu.be') ? 'youtube' : 'vimeo';
      await this.videoLibraryService.create({
        title: this.itemVideoEmbedTitle,
        source: source,
        url: this.itemVideoEmbedUrl,
      }, this.itemForm.lesson_library_id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Video link attached' });
      this.showItemVideoEmbed.set(false);
      await this.refreshItemVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add link' });
    } finally {
      this.itemVideoUploading.set(false);
    }
  }

  async detachItemVideo(video: VideoLibraryItem) {
    if (!this.itemForm.lesson_library_id) return;
    try {
      await this.lessonLibraryService.detachVideo(this.itemForm.lesson_library_id, video.id).toPromise();
      this.messageService.add({ severity: 'info', summary: 'Removed', detail: 'Video detached' });
      await this.refreshItemVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to detach video' });
    }
  }

  async deleteItemVideo(video: VideoLibraryItem) {
    try {
      await this.videoLibraryService.delete(video.id).toPromise();
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Video deleted' });
      await this.refreshItemVideos();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete video' });
    }
  }

  openItemVideoPreview(video: VideoLibraryItem) {
    this.selectedItemVideo.set(video);
    this.showItemVideoPreview.set(true);
  }

  private async refreshItemVideos() {
    if (!this.itemForm.lesson_library_id) {
      this.currentItemVideos.set([]);
      return;
    }
    try {
      const lesson = await this.lessonLibraryService.get(this.itemForm.lesson_library_id).toPromise();
      this.currentItemVideos.set(lesson?.videos || []);
    } catch {
      this.currentItemVideos.set([]);
    }
  }

  itemGetSourceIcon(type: string): string {
    switch (type) {
      case 'upload': return 'pi pi-video';
      case 'youtube': return 'pi pi-youtube';
      case 'vimeo': return 'pi pi-vimeo';
      default: return 'pi pi-file';
    }
  }

  itemGetSourceColor(type: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (type) {
      case 'upload': return 'info';
      case 'youtube': return 'danger';
      case 'vimeo': return 'info';
      default: return 'info';
    }
  }

  itemGetThumbnailUrl(video: VideoLibraryItem): string | null {
    if (video.source === 'youtube' && video.url) {
      const match = video.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
    }
    return null;
  }

  itemGetVideoUrl(video: VideoLibraryItem): string {
    return video.url || `/api/v1/video-library/${video.id}/stream`;
  }

  itemGetEmbedUrl(url: string): string {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return url;
  }

  itemGetSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.itemGetEmbedUrl(url));
  }

  itemSaveResumeTime(id: string, event: Event) {
    const video = event.target as HTMLVideoElement;
    if (video.currentTime > 5) localStorage.setItem(`videoResume_${id}`, String(video.currentTime));
  }

  itemRestoreResumeTime(event: Event, id: string) {
    const saved = localStorage.getItem(`videoResume_${id}`);
    if (saved) (event.target as HTMLVideoElement).currentTime = parseFloat(saved);
  }

  transmissionTypes = [
    { label: 'Manual', value: 'manual' },
    { label: 'Automatic', value: 'automatic' },
    { label: 'Both', value: 'both' },
  ];

  constructor(
    private lessonPlanService: LessonPlanService,
    private lessonLibraryService: LessonLibraryService,
    private videoLibraryService: VideoLibraryService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.loadTemplates();
  }

  async loadTemplates() {
    this.loading.set(true);
    try {
      const res = await this.lessonPlanService.listTemplates().toPromise();
      this.templates.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load templates' });
    } finally {
      this.loading.set(false);
    }
  }

  async loadLibraryLessons() {
    this.libraryLoading.set(true);
    try {
      const params: any = {};
      if (this.librarySearch()) params.search = this.librarySearch();
      const res = await this.lessonLibraryService.list(params).toPromise();
      this.libraryLessons.set(res || []);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load library lessons' });
    } finally {
      this.libraryLoading.set(false);
    }
  }

  openCreate() {
    this.editingTemplate.set(null);
    this.form = { name: '', transmission_type: 'manual', description: '', total_days: 20, total_weeks: 4, items: [] };
    this.showCreateDialog.set(true);
  }

  openEdit(tpl: LessonPlanTemplate) {
    this.editingTemplate.set(tpl);
    this.form = {
      name: tpl.name,
      transmission_type: tpl.transmission_type,
      description: tpl.description || '',
      total_days: tpl.total_days,
      total_weeks: tpl.total_weeks,
      items: [...tpl.lesson_items].sort((a, b) => a.order - b.order).map(i => ({
        day_number: i.day_number,
        week_number: i.week_number,
        title: i.title,
        description: (i as any).description ?? '',
        transmission_type: (i as any).transmission_type ?? null,
        lesson_objectives: i.lesson_objectives?.length ? [...i.lesson_objectives] : [''],
        practical_objectives: i.practical_objectives?.length ? [...i.practical_objectives] : [''],
        competencies: (i as any).competencies?.length ? [...(i as any).competencies] : [''],
        estimated_minutes: i.estimated_minutes ?? 30,
        estimated_distance_km: i.estimated_distance_km ?? 3,
        difficulty: (i as any).difficulty ?? 'beginner',
        order: i.order,
        lesson_library_id: i.lesson_library_id ?? undefined,
        preferred_location: i.preferred_location ?? undefined,
        enforce_prerequisites: i.enforce_prerequisites ?? true,
        training_category: (i as any).training_category ?? 'driving',
        prerequisite_competencies: (i as any).prerequisite_competencies?.length ? [...(i as any).prerequisite_competencies] : [''],
        prerequisite_lesson_ids: (i as any).prerequisite_lesson_ids ?? [],
      })),
    };
    this.showCreateDialog.set(true);
  }

  // ── Item picker ──

  openAddItem() {
    this.editingItemIndex.set(-1);
    this.resetItemForm();
    this.pickerMode = 'library';
    this.loadLibraryLessons();
    // Load all lessons for prerequisite picker
    this.lessonLibraryService.list().toPromise().then(res => this.allLibraryLessons.set(res || []));
    this.showPicker.set(true);
  }

  openEditItem(index: number) {
    this.editingItemIndex.set(index);
    const item = this.form.items[index] as any;
    this.itemForm = {
      day_number: item.day_number,
      week_number: item.week_number,
      title: item.title,
      description: item.description ?? '',
      transmission_type: item.transmission_type ?? null,
      lesson_objectives: item.lesson_objectives?.length ? [...item.lesson_objectives] : [''],
      practical_objectives: item.practical_objectives?.length ? [...item.practical_objectives] : [''],
      competencies: item.competencies?.length ? [...item.competencies] : [''],
      estimated_minutes: item.estimated_minutes ?? 30,
      estimated_distance_km: item.estimated_distance_km ?? 3,
      difficulty: item.difficulty ?? 'beginner',
      order: item.order,
      lesson_library_id: item.lesson_library_id ?? null,
      preferred_location: item.preferred_location ?? '',
      enforce_prerequisites: item.enforce_prerequisites ?? true,
      training_category: item.training_category ?? 'driving',
      prerequisite_competencies: item.prerequisite_competencies?.length ? [...item.prerequisite_competencies] : [''],
      prerequisite_lesson_ids: item.prerequisite_lesson_ids ?? [],
    };
    this.pickerMode = 'create';
    this.showPicker.set(true);
    // Load videos if lesson_library_id exists
    if (this.itemForm.lesson_library_id) {
      this.refreshItemVideos();
    } else {
      this.currentItemVideos.set([]);
    }
  }

  resetItemForm() {
    this.itemForm = {
      day_number: 1, week_number: 1, title: '', description: '', transmission_type: null,
      lesson_objectives: [''], practical_objectives: [''], competencies: [''],
      estimated_minutes: 30, estimated_distance_km: 3, difficulty: 'beginner',
      order: this.form.items.length + 1, lesson_library_id: null,
      preferred_location: '', enforce_prerequisites: true,
      training_category: 'driving', prerequisite_competencies: [''], prerequisite_lesson_ids: [],
    };
    this.currentItemVideos.set([]);
  }

  selectLibraryLesson(lesson: LessonLibrary) {
    this.itemForm = {
      day_number: this.itemForm.day_number,
      week_number: this.itemForm.week_number,
      title: lesson.title,
      description: lesson.description || '',
      transmission_type: lesson.transmission_type,
      lesson_objectives: lesson.lesson_objectives?.length ? [...lesson.lesson_objectives] : [''],
      practical_objectives: lesson.practical_objectives?.length ? [...lesson.practical_objectives] : [''],
      competencies: lesson.competencies?.length ? [...lesson.competencies] : [''],
      estimated_minutes: lesson.estimated_minutes,
      estimated_distance_km: lesson.estimated_distance_km,
      difficulty: lesson.difficulty,
      order: this.itemForm.order,
      lesson_library_id: lesson.id,
      preferred_location: lesson.preferred_location || '',
      enforce_prerequisites: true,
      training_category: lesson.training_category || 'driving',
      prerequisite_competencies: lesson.prerequisite_competencies?.length ? [...lesson.prerequisite_competencies] : [''],
      prerequisite_lesson_ids: lesson.prerequisite_lessons?.map(p => p.id) || [],
    };
    this.pickerMode = 'create';
    this.currentItemVideos.set(lesson.videos || []);
  }

  switchToCreate() {
    this.pickerMode = 'create';
    if (!this.itemForm.title) {
      this.itemForm.lesson_library_id = null;
    }
  }

  switchToLibrary() {
    this.pickerMode = 'library';
    this.loadLibraryLessons();
  }

  addArrayItem(key: string) {
    (this.itemForm as any)[key] = [...((this.itemForm as any)[key] || []), ''];
  }

  removeArrayItem(key: string, idx: number) {
    (this.itemForm as any)[key] = ((this.itemForm as any)[key] || []).filter((_: any, i: number) => i !== idx);
  }

  confirmItem() {
    const data = {
      day_number: this.itemForm.day_number,
      week_number: this.itemForm.week_number,
      title: this.itemForm.title,
      description: this.itemForm.description || undefined,
      transmission_type: this.itemForm.transmission_type || undefined,
      lesson_objectives: this.itemForm.lesson_objectives.filter(s => s.trim()),
      practical_objectives: this.itemForm.practical_objectives.filter(s => s.trim()),
      competencies: this.itemForm.competencies.filter(s => s.trim()),
      estimated_minutes: this.itemForm.estimated_minutes,
      estimated_distance_km: this.itemForm.estimated_distance_km,
      difficulty: this.itemForm.difficulty,
      order: this.itemForm.order,
      lesson_library_id: this.itemForm.lesson_library_id ?? undefined,
      preferred_location: this.itemForm.preferred_location || undefined,
      enforce_prerequisites: this.itemForm.enforce_prerequisites,
      training_category: this.itemForm.training_category,
      prerequisite_competencies: this.itemForm.prerequisite_competencies.filter(s => s.trim()),
      prerequisite_lesson_ids: this.itemForm.prerequisite_lesson_ids,
    };
    const idx = this.editingItemIndex();
    if (idx >= 0) {
      this.form.items = this.form.items.map((item, i) => i === idx ? data : item);
    } else {
      this.form.items = [...this.form.items, data];
    }
    this.showPicker.set(false);
  }

  removeItem(index: number) {
    this.form.items = this.form.items.filter((_, i) => i !== index);
  }

  async save() {
    const editing = this.editingTemplate();
    this.loading.set(true);
    try {
      if (editing) {
        await this.lessonPlanService.updateTemplate(editing.id, {
          name: this.form.name,
          description: this.form.description || undefined,
          total_days: this.form.total_days,
          total_weeks: this.form.total_weeks,
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Template updated' });
      } else {
        await this.lessonPlanService.createTemplate({
          name: this.form.name,
          transmission_type: this.form.transmission_type,
          description: this.form.description || undefined,
          total_days: this.form.total_days,
          total_weeks: this.form.total_weeks,
          items: this.form.items.map((i: any) => ({
            day_number: i.day_number,
            week_number: i.week_number,
            title: i.title,
            description: i.description || undefined,
            transmission_type: i.transmission_type || undefined,
            lesson_objectives: i.lesson_objectives?.filter((s: string) => s.trim()) || undefined,
            practical_objectives: i.practical_objectives?.filter((s: string) => s.trim()) || undefined,
            competencies: i.competencies?.filter((s: string) => s.trim()) || undefined,
            estimated_minutes: i.estimated_minutes,
            estimated_distance_km: i.estimated_distance_km,
            difficulty: i.difficulty || 'beginner',
            order: i.order,
            lesson_library_id: i.lesson_library_id || undefined,
            preferred_location: i.preferred_location || undefined,
            enforce_prerequisites: i.enforce_prerequisites,
            training_category: i.training_category || 'driving',
            prerequisite_competencies: i.prerequisite_competencies?.filter((s: string) => s.trim()) || undefined,
            prerequisite_lesson_ids: i.prerequisite_lesson_ids || undefined,
          })),
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Created', detail: 'Template created' });
      }
      this.showCreateDialog.set(false);
      await this.loadTemplates();
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to ${editing ? 'update' : 'create'} template` });
    } finally {
      this.loading.set(false);
    }
  }

  confirmDelete(tpl: LessonPlanTemplate) {
    this.confirmationService.confirm({
      message: `Delete "${tpl.name}"? This cannot be undone.`,
      header: 'Delete Template',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteTemplate(tpl),
    });
  }

  async deleteTemplate(tpl: LessonPlanTemplate) {
    try {
      await this.lessonPlanService.deleteTemplate(tpl.id).toPromise();
      this.templates.update(list => list.filter(t => t.id !== tpl.id));
      this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Template deleted' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete template' });
    }
  }

  transmissionLabel(t: string): string {
    switch (t) {
      case 'manual': return 'Manual';
      case 'automatic': return 'Automatic';
      case 'both': return 'Both';
      default: return t;
    }
  }

  // ── Import / Export / Schema ──

  openImport() {
    this.importTab = 'paste';
    this.importJsonText.set('');
    this.importFile = null;
    this.importResult.set(null);
    this.importSuccess.set(false);
    this.showImportDialog.set(true);
  }

  onImportFileSelected(event: any) {
    const file = event.target?.files?.[0];
    if (!file) return;
    this.importFile = file;
    this.importResult.set(null);
    this.importSuccess.set(false);
    const reader = new FileReader();
    reader.onload = () => this.importJsonText.set(reader.result as string);
    reader.readAsText(file);
  }

  get parsedJson(): any | null {
    const text = this.importJsonText();
    if (!text?.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  get parseError(): string | null {
    const text = this.importJsonText();
    if (!text?.trim()) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e: any) {
      return e.message || 'Invalid JSON';
    }
  }

  async validateImport() {
    const data = this.parsedJson;
    if (!data) return;
    this.importLoading.set(true);
    this.importResult.set(null);
    try {
      const res: any = await this.lessonPlanService.validateImport(data).toPromise();
      this.importResult.set(res);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Validation request failed' });
    } finally {
      this.importLoading.set(false);
    }
  }

  async doImport() {
    const data = this.parsedJson;
    if (!data) return;
    this.importLoading.set(true);
    try {
      await this.lessonPlanService.importTemplate(data).toPromise();
      this.importSuccess.set(true);
      this.messageService.add({ severity: 'success', summary: 'Imported', detail: 'Template imported successfully' });
      await this.loadTemplates();
      setTimeout(() => this.showImportDialog.set(false), 1500);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Import failed' });
    } finally {
      this.importLoading.set(false);
    }
  }

  async exportTemplate(tpl: LessonPlanTemplate) {
    try {
      const data: any = await this.lessonPlanService.exportTemplate(tpl.id).toPromise();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tpl.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.messageService.add({ severity: 'success', summary: 'Exported', detail: 'Template JSON downloaded' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Export failed' });
    }
  }

  downloadSchema() {
    const schema = {
      "$schema": "https://json-schema.org/draft-07/schema#",
      "$id": "https://drivingschoolcrm.example/lesson-plan-template-schema.json",
      "title": "Driving School CRM — Lesson Plan Template Import",
      "description": "Full JSON Schema (draft-07) for importing lesson plan templates. Drop this into any AI code-generation tool to create valid template JSON.",
      "version": "1.1",
      "type": "object",
      "required": ["title", "transmission_type", "weeks"],
      "properties": {
        "version": {
          "type": "string",
          "description": "Schema version for forward compatibility",
          "default": "1.1",
          "examples": ["1.1"]
        },
        "title": {
          "type": "string",
          "description": "Template name — displayed in the Lesson Plans list",
          "minLength": 1,
          "maxLength": 200,
          "examples": ["20-Day Manual Driving Curriculum", "Automatic Transmission Beginner"]
        },
        "transmission_type": {
          "type": "string",
          "description": "Vehicle transmission type the template is designed for",
          "enum": ["manual", "automatic", "both"],
          "examples": ["manual"]
        },
        "total_days": {
          "type": "integer",
          "description": "Total number of training days in the curriculum",
          "minimum": 1,
          "default": 20,
          "examples": [20]
        },
        "total_weeks": {
          "type": "integer",
          "description": "Total number of weeks the curriculum spans",
          "minimum": 1,
          "default": 4,
          "examples": [4]
        },
        "description": {
          "type": "string",
          "description": "Optional description explaining the template's purpose or target audience",
          "maxLength": 500,
          "default": "",
          "examples": ["Standard 20-day curriculum for manual transmission learners"]
        },
        "weeks": {
          "type": "array",
          "description": "Ordered array of weeks. Each week contains an array of lessons (days). Day numbers must be unique across all weeks.",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["week_number", "days"],
            "properties": {
              "week_number": {
                "type": "integer",
                "description": "1-based week number",
                "minimum": 1,
                "examples": [1]
              },
              "days": {
                "type": "array",
                "description": "Lessons (days) belonging to this week, ordered by day_number",
                "minItems": 1,
                "items": {
                  "type": "object",
                  "required": ["day_number", "title"],
                  "properties": {
                    "day_number": {
                      "type": "integer",
                      "description": "Globally unique day number across the whole curriculum (not just per-week)",
                      "minimum": 1,
                      "examples": [1]
                    },
                    "title": {
                      "type": "string",
                      "description": "Short lesson title",
                      "maxLength": 200,
                      "examples": ["Vehicle Controls & Cockpit Drill", "Moving Off & Stopping"]
                    },
                    "lesson_objectives": {
                      "type": "array",
                      "description": "Theoretical knowledge objectives for this lesson",
                      "items": { "type": "string", "maxLength": 500 },
                      "default": [],
                      "examples": [["Understand cockpit drill (DSSSM)", "Identify major controls", "Explain blind spots"]]
                    },
                    "practical_objectives": {
                      "type": "array",
                      "description": "Practical driving objectives to be assessed during the lesson",
                      "items": { "type": "string", "maxLength": 500 },
                      "default": [],
                      "examples": [["Perform cockpit drill correctly", "Adjust seat, mirrors, steering wheel", "Demonstrate hand positions"]]
                    },
                    "estimated_minutes": {
                      "type": "integer",
                      "description": "Estimated lesson duration in minutes",
                      "minimum": 15,
                      "maximum": 180,
                      "default": 30,
                      "examples": [60]
                    },
                    "estimated_distance_km": {
                      "type": "number",
                      "description": "Estimated driving distance for the lesson in kilometres",
                      "minimum": 0,
                      "default": 3.0,
                      "examples": [5.0]
                    },
                    "preferred_location": {
                      "type": "string",
                      "description": "Preferred training location or area type (e.g., parking lot, quiet residential, urban, highway)",
                      "maxLength": 300,
                      "default": "",
                      "examples": ["Parking lot", "Quiet residential area", "Multi-lane roundabout"]
                    },
                    "enforce_prerequisites": {
                      "type": "boolean",
                      "description": "If true, the system will check that prerequisite lessons and competencies are completed before allowing this lesson to start",
                      "default": true,
                      "examples": [true, false]
                    },
                    "competencies": {
                      "type": "array",
                      "description": "List of competency/skill names for this lesson (stored on the auto-created LessonLibrary entry)",
                      "items": { "type": "string", "maxLength": 200 },
                      "default": [],
                      "examples": [["Cockpit drill", "Controls familiarisation"]]
                    }
                  },
                  "additionalProperties": false
                }
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false,
      "examples": [
        {
          "version": "1.1",
          "title": "20-Day Manual Driving Curriculum",
          "transmission_type": "manual",
          "total_days": 20,
          "total_weeks": 4,
          "description": "Standard 20-day curriculum for manual transmission covering all basic and intermediate skills",
          "weeks": [
            {
              "week_number": 1,
              "days": [
                {
                  "day_number": 1,
                  "title": "Vehicle Controls & Cockpit Drill",
                  "lesson_objectives": ["Understand cockpit drill (DSSSM)", "Identify major controls"],
                  "practical_objectives": ["Perform cockpit drill correctly", "Adjust seat/mirrors/steering"],
                  "estimated_minutes": 60,
                  "estimated_distance_km": 0,
                  "preferred_location": "Parking lot",
                  "enforce_prerequisites": false,
                  "competencies": ["Cockpit drill", "Controls familiarisation"]
                },
                {
                  "day_number": 2,
                  "title": "Moving Off & Stopping",
                  "lesson_objectives": ["Learn POM routine", "Understand safe stopping"],
                  "practical_objectives": ["Move off safely on level ground", "Stop accurately"],
                  "estimated_minutes": 60,
                  "estimated_distance_km": 2.0,
                  "preferred_location": "Quiet residential area",
                  "enforce_prerequisites": true,
                  "competencies": ["Moving off", "Stopping"]
                }
              ]
            },
            {
              "week_number": 2,
              "days": [
                {
                  "day_number": 6,
                  "title": "Left Turns & Junctions",
                  "lesson_objectives": ["Understand junction approach", "MSM routine"],
                  "practical_objectives": ["Execute safe left turns", "Use MSM correctly"],
                  "estimated_minutes": 60,
                  "estimated_distance_km": 3.0,
                  "preferred_location": "Residential junctions",
                  "enforce_prerequisites": true,
                  "competencies": ["Left turns", "MSM routine"]
                }
              ]
            }
          ]
        }
      ]
    };
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lesson_plan_template_schema.json';
    a.click();
    URL.revokeObjectURL(url);
    this.messageService.add({ severity: 'success', summary: 'Downloaded', detail: 'Schema JSON downloaded' });
  }
}
