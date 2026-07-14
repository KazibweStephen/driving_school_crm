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
    template_type: string;
    total_days: number;
    total_weeks: number;
    items: {
      id?: string;
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
      is_theory?: boolean;
    }[];
  } = { name: '', transmission_type: 'manual', description: '', template_type: 'practical', total_days: 20, total_weeks: 4, items: [] };

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
    is_theory: boolean;
  } = {
    day_number: 1, week_number: 1, title: '', description: '', transmission_type: null,
    lesson_objectives: [''], practical_objectives: [''], competencies: [''],
    estimated_minutes: 30, estimated_distance_km: 3, difficulty: 'beginner',
    order: 1, lesson_library_id: null, preferred_location: '', enforce_prerequisites: true,
    training_category: 'driving', prerequisite_competencies: [''], prerequisite_lesson_ids: [],
    is_theory: false,
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
    this.form = { name: '', transmission_type: 'manual', description: '', template_type: 'practical', total_days: 20, total_weeks: 4, items: [] };
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
      template_type: tpl.template_type,
      items: [...tpl.lesson_items].sort((a, b) => a.order - b.order).map(i => ({
        id: i.id,
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
        is_theory: (i as any).is_theory ?? false,
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
      is_theory: item.is_theory ?? false,
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
      is_theory: false,
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
      is_theory: lesson.is_theory || false,
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
      is_theory: this.itemForm.is_theory ?? false,
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
          template_type: this.form.template_type,
          items: this.form.items.map((i: any) => ({
            id: i.id || undefined,
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
            is_theory: i.is_theory || false,
          })),
        }).toPromise();
        this.messageService.add({ severity: 'success', summary: 'Updated', detail: 'Template updated' });
      } else {
        await this.lessonPlanService.createTemplate({
          name: this.form.name,
          transmission_type: this.form.transmission_type,
          description: this.form.description || undefined,
          total_days: this.form.total_days,
          total_weeks: this.form.total_weeks,
          template_type: this.form.template_type,
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
            is_theory: i.is_theory || false,
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
      "description": "Full JSON Schema (draft-07) for importing lesson plan templates into the Driving School CRM. Each week has 6 lessons: 5 practical days (Mon–Fri, 30 min each) and 1 theory class (Saturday, 120 min). A 4-week curriculum has 24 lessons total (20 practical + 4 theory).",
      "version": "2.0",
      "type": "object",
      "required": ["title", "transmission_type", "weeks"],
      "properties": {
        "version": {
          "type": "string",
          "description": "Schema version for forward compatibility",
          "default": "2.0",
          "examples": ["2.0"]
        },
        "title": {
          "type": "string",
          "description": "Template name — displayed in the Lesson Plans list",
          "minLength": 1,
          "maxLength": 200,
          "examples": ["20-Day Manual Driving Curriculum"]
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
        "template_type": {
          "type": "string",
          "description": "Type of curriculum: 'practical' (driving lessons), 'theory' (classroom), or 'combined'",
          "enum": ["practical", "theory", "combined"],
          "default": "practical",
          "examples": ["practical"]
        },
        "description": {
          "type": "string",
          "description": "Brief curriculum description. Each week: 5 practical days (Mon–Fri, 30 min) + 1 theory class (Sat, 120 min). 4-week template = 24 lessons (20 practical + 4 theory).",
          "maxLength": 500,
          "default": "",
          "examples": ["Standard 4-week manual transmission curriculum: 20 practical driving lessons + 4 theory classes"]
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
                      "examples": ["Vehicle Controls & Cockpit Drill"]
                    },
                    "description": {
                      "type": "string",
                      "description": "Brief description of the lesson content and goals",
                      "maxLength": 500,
                      "default": "",
                      "examples": ["Introduction to vehicle controls, cockpit drill routine, and basic safety checks"]
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
                      "description": "Estimated lesson duration in minutes (each lesson slot is 30 min or 3 km, whichever first)",
                      "minimum": 15,
                      "maximum": 240,
                      "default": 30,
                      "examples": [30, 60]
                    },
                    "estimated_distance_km": {
                      "type": "number",
                      "description": "Estimated driving distance for the lesson in kilometres",
                      "minimum": 0,
                      "default": 3.0,
                      "examples": [3.0, 5.0]
                    },
                    "preferred_location": {
                      "type": "string",
                      "description": "Preferred training location or area type",
                      "maxLength": 300,
                      "default": "",
                      "examples": ["Parking lot", "Quiet residential area", "Multi-lane roundabout", "Urban dual carriageway"]
                    },
                    "enforce_prerequisites": {
                      "type": "boolean",
                      "description": "If true, the system checks that prerequisite lessons and competencies are completed before allowing this lesson to start",
                      "default": true,
                      "examples": [true, false]
                    },
                    "is_theory": {
                      "type": "boolean",
                      "description": "If true, this is a theory/classroom lesson rather than a practical driving lesson",
                      "default": false,
                      "examples": [false, true]
                    },
                    "competencies": {
                      "type": "array",
                      "description": "Skills/competencies the student must demonstrate to pass this lesson",
                      "items": { "type": "string", "maxLength": 200 },
                      "default": [],
                      "examples": [["Cockpit drill", "Controls familiarisation"]]
                    },
                    "difficulty": {
                      "type": "string",
                      "description": "Difficulty level of this lesson",
                      "enum": ["beginner", "intermediate", "advanced"],
                      "default": "beginner",
                      "examples": ["beginner"]
                    },
                    "training_category": {
                      "type": "string",
                      "description": "Vehicle/category this lesson is for",
                      "enum": ["driving", "motorcycle", "truck", "bus"],
                      "default": "driving",
                      "examples": ["driving"]
                    },
                    "prerequisite_competencies": {
                      "type": "array",
                      "description": "Competencies that must be achieved before starting this lesson",
                      "items": { "type": "string", "maxLength": 200 },
                      "default": [],
                      "examples": [["Moving off", "Stopping"]]
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
          "version": "2.0",
          "title": "4-Week Manual Driving Curriculum",
          "transmission_type": "manual",
          "total_days": 24,
          "total_weeks": 4,
          "template_type": "practical",
          "description": "4-week manual curriculum: 20 practical driving lessons (Mon-Fri, 30min each) + 4 theory classes (Saturday, 120min each)",
          "weeks": [
            {
              "week_number": 1,
              "days": [
                {
                  "day_number": 1,
                  "title": "Cockpit Drill & Vehicle Controls",
                  "description": "Introduction to vehicle controls and the DSSSM cockpit drill routine",
                  "lesson_objectives": ["Understand DSSSM cockpit drill", "Identify all major controls"],
                  "practical_objectives": ["Perform cockpit drill correctly", "Adjust seat, mirrors, steering wheel"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 0,
                  "preferred_location": "Parking lot",
                  "enforce_prerequisites": false,
                  "is_theory": false,
                  "competencies": ["Cockpit drill", "Controls familiarisation"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": []
                },
                {
                  "day_number": 2,
                  "title": "Moving Off & Stopping",
                  "description": "POM routine for moving off and controlled stopping",
                  "lesson_objectives": ["Learn POM routine", "Understand safe stopping"],
                  "practical_objectives": ["Move off safely on level ground", "Stop accurately"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 2.0,
                  "preferred_location": "Quiet residential road",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Moving off", "Controlled stopping"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Cockpit drill"]
                },
                {
                  "day_number": 3,
                  "title": "Steering & Gear Changes",
                  "description": "Push-pull steering and 1st/2nd gear changes",
                  "lesson_objectives": ["Push-pull steering technique", "Clutch control and bite point"],
                  "practical_objectives": ["Steer smoothly using push-pull", "Change 1st to 2nd gear without stalling"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 3.0,
                  "preferred_location": "Quiet residential area",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Push-pull steering", "Gear change"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Moving off"]
                },
                {
                  "day_number": 4,
                  "title": "Left Turns & Emerge Left",
                  "description": "Approaching and executing left turns at junctions",
                  "lesson_objectives": ["Junction approach procedure", "MSM routine"],
                  "practical_objectives": ["Execute safe left turns", "Use MSM correctly"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 3.0,
                  "preferred_location": "Residential junctions",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Left turns", "MSM routine"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Gear change"]
                },
                {
                  "day_number": 5,
                  "title": "Right Turns & Emerge Right",
                  "description": "Right turns at junctions with opposing traffic awareness",
                  "lesson_objectives": ["Right-turn junction procedure", "Gap judgement in oncoming traffic"],
                  "practical_objectives": ["Execute safe right turns", "Judge safe gaps in traffic"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 3.0,
                  "preferred_location": "Residential junctions",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Right turns", "Gap judgement"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Left turns"]
                },
                {
                  "day_number": 6,
                  "title": "Week 1 Theory — Rules of the Road",
                  "description": "Classroom session covering road signs, markings, and basic rules of the road",
                  "lesson_objectives": ["Identify all major road signs", "Understand road markings and their meanings", "Know basic rules of the road including speed limits"],
                  "practical_objectives": [],
                  "estimated_minutes": 120,
                  "estimated_distance_km": 0,
                  "preferred_location": "Classroom",
                  "enforce_prerequisites": false,
                  "is_theory": true,
                  "competencies": ["Road sign recognition", "Road marking knowledge", "Speed limit awareness"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": []
                }
              ]
            },
            {
              "week_number": 2,
              "days": [
                {
                  "day_number": 7,
                  "title": "Crossroads & T-Junctions",
                  "description": "Navigating crossroads and T-junction priority rules",
                  "lesson_objectives": ["Crossroads priority rules", "T-junction give-way markings"],
                  "practical_objectives": ["Navigate crossroads safely", "Correctly give way at T-junctions"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 4.0,
                  "preferred_location": "Residential area",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Crossroads navigation", "T-junction rules"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Right turns"]
                },
                {
                  "day_number": 8,
                  "title": "Mini-Roundabouts & Roundabouts",
                  "description": "Approaching and navigating mini-roundabouts and larger roundabouts",
                  "lesson_objectives": ["Roundabout priority and lane discipline", "Signalling on roundabouts"],
                  "practical_objectives": ["Navigate mini-roundabouts correctly", "Use correct lane on larger roundabouts"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 4.0,
                  "preferred_location": "Area with roundabouts",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Roundabout navigation", "Lane discipline"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Crossroads navigation"]
                },
                {
                  "day_number": 9,
                  "title": "Pedestrian Crossings & Traffic Lights",
                  "description": "Responding to different crossing types and traffic light sequences",
                  "lesson_objectives": ["Types of pedestrian crossings", "Traffic light sequences"],
                  "practical_objectives": ["Stop at pelican crossings", "Navigate traffic lights correctly"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 3.0,
                  "preferred_location": "Urban area",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Crossing response", "Traffic light compliance"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Roundabout navigation"]
                },
                {
                  "day_number": 10,
                  "title": "Reversing — Left Reverse",
                  "description": "Left reverse technique with constant rear observation",
                  "lesson_objectives": ["Left reverse procedure", "Rear observation importance"],
                  "practical_objectives": ["Perform left reverse accurately", "Maintain constant rear observation"],
                  "estimated_minutes": 30,
                  "estimated_distance_km": 2.0,
                  "preferred_location": "Quiet road",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Left reverse", "Rear observation"],
                  "difficulty": "intermediate",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Gear change"]
                },
                {
                  "day_number": 11,
                  "title": "Reversing — Right Reverse & Bay Parking",
                  "description": "Right reverse and reverse bay parking manoeuvres",
                  "lesson_objectives": ["Right reverse reference points", "Reverse bay parking technique"],
                  "practical_objectives": ["Perform right reverse", "Complete reverse bay parking"],
                  "estimated_minutes": 60,
                  "estimated_distance_km": 2.0,
                  "preferred_location": "Car park",
                  "enforce_prerequisites": true,
                  "is_theory": false,
                  "competencies": ["Right reverse", "Bay parking"],
                  "difficulty": "intermediate",
                  "training_category": "driving",
                  "prerequisite_competencies": ["Left reverse"]
                },
                {
                  "day_number": 12,
                  "title": "Week 2 Theory — hazard Perception & Awareness",
                  "description": "Classroom session on hazard perception, mirror routine, and defensive driving",
                  "lesson_objectives": ["Hazard perception test format", "Mirror-signal-manoeuvre in detail", "Defensive driving principles"],
                  "practical_objectives": [],
                  "estimated_minutes": 120,
                  "estimated_distance_km": 0,
                  "preferred_location": "Classroom",
                  "enforce_prerequisites": false,
                  "is_theory": true,
                  "competencies": ["Hazard perception", "Mirror routine knowledge", "Defensive driving awareness"],
                  "difficulty": "beginner",
                  "training_category": "driving",
                  "prerequisite_competencies": []
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

  downloadAiPrompt() {
    const prompt = `# Driving School CRM — Lesson Plan Template Generator

## Your Task

You are generating a **lesson plan template** for a driving school CRM system. The template defines a structured curriculum of driving lessons organized into weeks and days.

**IMPORTANT WEEK STRUCTURE:**
- Each week has **6 lessons**: 5 practical driving days (Monday to Friday) + 1 theory class (Saturday)
- Each **practical lesson** is **30 minutes** (or 3 km, whichever comes first)
- Each **theory class** is **120 minutes** (2 hours classroom session)
- A **4-week template** = **24 lessons total** (20 practical + 4 theory)
- **total_days = 24**, **total_weeks = 4**
- Practical days: day_number 1–5 (week 1), 7–11 (week 2), 13–17 (week 3), 19–23 (week 4)
- Theory days: day_number 6 (week 1), 12 (week 2), 18 (week 3), 24 (week 4)
- Theory lessons always have \`is_theory: true\`, \`estimated_minutes: 120\`, \`estimated_distance_km: 0\`, \`preferred_location: "Classroom"\`

**Output ONLY valid JSON** matching the format below. Do not include any text, markdown, or explanation outside the JSON block. The JSON must be directly importable into the CRM system.

---

## JSON Format

\`\`\`json
{
  "version": "2.0",
  "title": "TEMPLATE NAME",
  "transmission_type": "manual" | "automatic" | "both",
  "total_days": 24,
  "total_weeks": 4,
  "template_type": "practical" | "theory" | "combined",
  "description": "Brief description of the curriculum",
  "weeks": [
    {
      "week_number": 1,
      "days": [
        {
          "day_number": 1,
          "title": "Lesson Title",
          "description": "Brief description of what this lesson covers",
          "lesson_objectives": ["Theoretical knowledge goal 1", "Theoretical knowledge goal 2"],
          "practical_objectives": ["Practical driving skill 1", "Practical driving skill 2"],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Location or area type",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Skill name 1", "Skill name 2"],
          "difficulty": "beginner" | "intermediate" | "advanced",
          "training_category": "driving" | "motorcycle" | "truck" | "bus",
          "prerequisite_competencies": ["Previously achieved skill 1"]
        }
      ]
    }
  ]
}
\`\`\`

## Field Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | No | Schema version, always use "2.0" |
| title | string | **Yes** | Template name shown in the CRM |
| transmission_type | string | **Yes** | "manual", "automatic", or "both" |
| total_days | integer | No | Total lessons across all weeks. For 4-week curriculum: **24** |
| total_weeks | integer | No | Number of weeks. For standard curriculum: **4** |
| template_type | string | No | "practical" (default), "theory", or "combined" |
| description | string | No | Brief curriculum description |
| weeks | array | **Yes** | Array of week objects containing lessons |

### Week Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| week_number | integer | **Yes** | 1-based week number |
| days | array | **Yes** | Array of 6 lesson objects (5 practical + 1 theory) |

### Day (Lesson) Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| day_number | integer | **Yes** | — | Globally unique lesson number (1–24 for 4-week curriculum) |
| title | string | **Yes** | — | Short lesson title (max 200 chars) |
| description | string | No | "" | Brief lesson description |
| lesson_objectives | string[] | No | [] | What the student should know (theory/knowledge) |
| practical_objectives | string[] | No | [] | What the student should be able to do (practice) |
| estimated_minutes | integer | No | 30 | **30** for practical lessons, **120** for theory classes |
| estimated_distance_km | number | No | 3.0 | **0** for theory/parking lot, 2–8 for road lessons |
| preferred_location | string | No | "" | **"Classroom"** for theory; parking lot, road type, etc. for practical |
| enforce_prerequisites | boolean | No | true | Whether prerequisite lessons must be completed first |
| is_theory | boolean | No | false | **true** for Saturday theory classes, **false** for practical driving |
| competencies | string[] | No | [] | Skills the student must demonstrate |
| difficulty | string | No | "beginner" | "beginner", "intermediate", or "advanced" |
| training_category | string | No | "driving" | "driving", "motorcycle", "truck", or "bus" |
| prerequisite_competencies | string[] | No | [] | Skills that must be achieved before this lesson |

---

## Week Structure Pattern

Each week follows this exact pattern:

| Day | Day Number | Type | Duration | Location | Distance |
|-----|-----------|------|----------|----------|----------|
| Monday | week_start + 0 | Practical | 30 min | Road/area | 2–8 km |
| Tuesday | week_start + 1 | Practical | 30 min | Road/area | 2–8 km |
| Wednesday | week_start + 2 | Practical | 30 min | Road/area | 2–8 km |
| Thursday | week_start + 3 | Practical | 30 min | Road/area | 2–8 km |
| Friday | week_start + 4 | Practical | 30 min | Road/area | 2–8 km |
| Saturday | week_start + 5 | **Theory** | **120 min** | **Classroom** | **0 km** |

Day numbering: Week 1 = days 1–6, Week 2 = days 7–12, Week 3 = days 13–18, Week 4 = days 19–24

---

## Driving School Domain Context

When generating a manual transmission driving curriculum, follow this progression:

### Week 1 — Foundations (Beginner) — Days 1–6
- **Day 1 (Mon)**: Cockpit drill, vehicle controls, DSSSM routine (parking lot, 0 km)
- **Day 2 (Tue)**: Moving off and stopping — POM routine (quiet road, 2 km)
- **Day 3 (Wed)**: Steering and gear changes — 1st/2nd gear (residential, 3 km)
- **Day 4 (Thu)**: Left turns and emerge left at junctions (residential, 3 km)
- **Day 5 (Fri)**: Right turns and emerge right at junctions (residential, 3 km)
- **Day 6 (Sat)**: **THEORY** — Rules of the road, road signs, speed limits (classroom, 120 min)

### Week 2 — Junctions & Reversing (Beginner–Intermediate) — Days 7–12
- **Day 7 (Mon)**: Crossroads and T-junctions (residential, 4 km)
- **Day 8 (Tue)**: Mini-roundabouts and roundabouts (area with roundabouts, 4 km)
- **Day 9 (Wed)**: Pedestrian crossings and traffic lights (urban, 3 km)
- **Day 10 (Thu)**: Reversing — left reverse technique (quiet road, 2 km)
- **Day 11 (Fri)**: Reversing — right reverse and reverse bay parking (car park, 2 km)
- **Day 12 (Sat)**: **THEORY** — Hazard perception, mirror routine, defensive driving (classroom, 120 min)

### Week 3 — Maneuvres & Urban Driving (Intermediate) — Days 13–18
- **Day 13 (Mon)**: Three-point turn and turn in the road (quiet road, 2 km)
- **Day 14 (Tue)**: Dual carriageway driving (dual carriageway, 8 km)
- **Day 15 (Wed)**: Rural roads and bends (country roads, 6 km)
- **Day 16 (Thu)**: Independent driving — following signs/sat-nav (mixed, 5 km)
- **Day 17 (Fri)**: Adverse conditions and night driving awareness (urban, 4 km)
- **Day 18 (Sat)**: **THEORY** — Vehicle mechanics basics, test preparation, insurance (classroom, 120 min)

### Week 4 — Test Preparation (Intermediate–Advanced) — Days 19–24
- **Day 19 (Mon)**: Mock test route part 1 — urban (test route, 5 km)
- **Day 20 (Tue)**: Mock test route part 2 — rural + urban mix (test route, 5 km)
- **Day 21 (Wed)**: Weak area practice and refinement (varies, 4 km)
- **Day 22 (Thu)**: Final mock test — full route (test route, 6 km)
- **Day 23 (Fri)**: Final practice and confidence building (familiar area, 3 km)
- **Day 24 (Sat)**: **THEORY** — Test day review, show me/tell me questions, theory test prep (classroom, 120 min)

### Theory Class Topics by Week

- **Week 1 Theory (Day 6)**: Road signs, road markings, speed limits, basic rules of the road
- **Week 2 Theory (Day 12)**: Hazard perception test format, mirror-signal-manoeuvre in detail, defensive driving principles, eyesight requirements
- **Week 3 Theory (Day 18)**: Vehicle maintenance basics (tyres, lights, oil), insurance and documentation, driving test structure and format
- **Week 4 Theory (Day 24)**: Test day preparation, show me/tell me questions practice, theory test revision, Q&A session

### Competency Examples by Skill Area

- **Cockpit drill**: "DSSSM routine", "Seat adjustment", "Mirror adjustment", "Steering wheel position"
- **Moving off**: "POM routine", "Clutch control", "Handbrake release", "Observation checks"
- **Steering**: "Push-pull steering", "Positioning for turns", "Lane discipline"
- **Gear changes**: "1st to 2nd upshift", "2nd to 1st downshift", "Rev matching"
- **Junctions**: "MSM routine", "Left turn emerge", "Right turn emerge", "Give way rules"
- **Roundabouts**: "Approach and select lane", "Exit signal", "Mini-roundabout rules"
- **Reversing**: "Left reverse", "Right reverse", "Reverse parking", "Rear observation"
- **Manoeuvres**: "Three-point turn", "Turn in the road", "Bay parking"
- **Hazard awareness**: "Anticipation", "Reaction to hazards", "Road sign recognition"
- **Theory knowledge**: "Road sign identification", "Hazard perception technique", "Test preparation"

### Difficulty Progression Rules

- **Beginner** (Days 1–8): Vehicle control, basic manoeuvres, simple junctions
- **Intermediate** (Days 9–17): Reversing, complex junctions, dual carriageways, independent driving
- **Advanced** (Days 18–24): Test-level driving, mock tests, refinement, test preparation

### Lesson Design Rules

1. **Every week MUST have exactly 6 lessons**: 5 practical (Mon–Fri) + 1 theory (Sat)
2. Day numbers must be sequential and unique (1, 2, 3... up to 24)
3. First lesson (day 1) should have \`enforce_prerequisites: false\` and empty \`prerequisite_competencies\`
4. Practical lessons: \`estimated_minutes: 30\`, \`is_theory: false\`, \`estimated_distance_km: 2-8\`
5. Theory classes: \`estimated_minutes: 120\`, \`is_theory: true\`, \`estimated_distance_km: 0\`, \`preferred_location: "Classroom"\`
6. Theory classes should have practical objectives as \`[]\` (empty) since they are classroom-only
7. Practical lessons should have both lesson_objectives AND practical_objectives
8. \`competencies\` should be specific, assessable skills (not vague goals)
9. \`prerequisite_competencies\` should reference competencies from EARLIER lessons in the curriculum
10. Location should progress: parking lot → quiet residential → urban → mixed → test routes
11. Difficulty should progress: beginner → intermediate → advanced over the curriculum
12. Total lessons (total_days) must equal the count of all day objects across all weeks
13. Each week's theory class should cover topics that complement that week's practical skills

---

## Example Output

\`\`\`json
{
  "version": "2.0",
  "title": "4-Week Manual Driving Curriculum",
  "transmission_type": "manual",
  "total_days": 24,
  "total_weeks": 4,
  "template_type": "practical",
  "description": "4-week manual curriculum: 20 practical driving lessons (Mon-Fri, 30min each) + 4 theory classes (Saturday, 120min each)",
  "weeks": [
    {
      "week_number": 1,
      "days": [
        {
          "day_number": 1,
          "title": "Cockpit Drill & Vehicle Controls",
          "description": "Introduction to vehicle controls and the DSSSM cockpit drill routine",
          "lesson_objectives": [
            "Understand the DSSSM cockpit drill sequence",
            "Identify all major vehicle controls",
            "Explain the purpose of each mirror and blind spots"
          ],
          "practical_objectives": [
            "Perform complete cockpit drill independently",
            "Correctly adjust seat, mirrors, and steering wheel",
            "Identify and operate all controls without prompting"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 0,
          "preferred_location": "Parking lot",
          "enforce_prerequisites": false,
          "is_theory": false,
          "competencies": ["DSSSM cockpit drill", "Controls familiarisation", "Mirror adjustment"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": []
        },
        {
          "day_number": 2,
          "title": "Moving Off & Stopping",
          "description": "POM routine for moving off and controlled stopping",
          "lesson_objectives": [
            "Explain the POM (Prepare, Observe, Move) routine",
            "Understand when to use the handbrake",
            "Know safe stopping procedure"
          ],
          "practical_objectives": [
            "Move off safely using POM on level ground",
            "Stop smoothly and accurately",
            "Perform effective observations before moving off"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 2.0,
          "preferred_location": "Quiet residential road",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["POM routine", "Controlled stopping", "Observation checks"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["DSSSM cockpit drill"]
        },
        {
          "day_number": 3,
          "title": "Steering & Gear Changes",
          "description": "Push-pull steering technique and 1st/2nd gear changes",
          "lesson_objectives": [
            "Understand push-pull steering technique",
            "Learn when to change between 1st and 2nd gear",
            "Understand clutch control and bite point"
          ],
          "practical_objectives": [
            "Steer smoothly using push-pull technique",
            "Change from 1st to 2nd gear without stalling",
            "Maintain vehicle control at low speed"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Quiet residential area",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Push-pull steering", "1st-2nd gear change", "Clutch control"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["POM routine", "Controlled stopping"]
        },
        {
          "day_number": 4,
          "title": "Left Turns & Emerge Left",
          "description": "Approaching and executing left turns at junctions",
          "lesson_objectives": [
            "Understand junction approach procedure",
            "Learn the MSM (Mirror-Signal-Manoeuvre) routine",
            "Know give-way rules at junctions"
          ],
          "practical_objectives": [
            "Approach junctions at appropriate speed",
            "Execute safe left turns using MSM",
            "Correctly position the vehicle for turning"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Residential junctions",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Left turn emerge", "MSM routine", "Junction approach"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["Push-pull steering", "1st-2nd gear change"]
        },
        {
          "day_number": 5,
          "title": "Right Turns & Emerge Right",
          "description": "Right turns at junctions with opposing traffic awareness",
          "lesson_objectives": [
            "Understand right-turn procedure at junctions",
            "Learn to judge gaps in oncoming traffic",
            "Know when to wait and when to proceed"
          ],
          "practical_objectives": [
            "Execute safe right turns at junctions",
            "Correctly position for right turns",
            "Judge safe gaps in oncoming traffic"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Residential junctions",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Right turn emerge", "Gap judgement", "Centre line positioning"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["Left turn emerge", "MSM routine"]
        },
        {
          "day_number": 6,
          "title": "Week 1 Theory — Rules of the Road",
          "description": "Classroom session covering road signs, markings, and basic rules of the road",
          "lesson_objectives": [
            "Identify all major road signs and their meanings",
            "Understand road markings and their implications",
            "Know speed limits for different road types",
            "Understand basic rules of the road"
          ],
          "practical_objectives": [],
          "estimated_minutes": 120,
          "estimated_distance_km": 0,
          "preferred_location": "Classroom",
          "enforce_prerequisites": false,
          "is_theory": true,
          "competencies": ["Road sign recognition", "Road marking knowledge", "Speed limit awareness"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": []
        }
      ]
    },
    {
      "week_number": 2,
      "days": [
        {
          "day_number": 7,
          "title": "Crossroads & T-Junctions",
          "description": "Navigating crossroads and T-junction priority rules",
          "lesson_objectives": [
            "Understand crossroads priority rules",
            "Identify T-junction give-way markings",
            "Learn to assess multiple traffic streams"
          ],
          "practical_objectives": [
            "Navigate crossroads safely in both directions",
            "Correctly give way at T-junctions",
            "Maintain appropriate speed approaching junctions"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 4.0,
          "preferred_location": "Residential area with crossroads",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Crossroads navigation", "T-junction rules", "Multi-stream assessment"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["Right turn emerge", "Gap judgement"]
        },
        {
          "day_number": 8,
          "title": "Mini-Roundabouts & Roundabouts",
          "description": "Approaching and navigating mini-roundabouts and larger roundabouts",
          "lesson_objectives": [
            "Understand roundabout priority and lane discipline",
            "Learn mini-roundabout rules and positioning",
            "Know signalling procedure on roundabouts"
          ],
          "practical_objectives": [
            "Navigate mini-roundabouts correctly",
            "Use correct lane and signal on larger roundabouts",
            "Exit roundabouts at the correct point"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 4.0,
          "preferred_location": "Area with mini-roundabouts",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Mini-roundabout navigation", "Roundabout lane discipline", "Exit signalling"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["Crossroads navigation", "MSM routine"]
        },
        {
          "day_number": 9,
          "title": "Pedestrian Crossings & Traffic Lights",
          "description": "Responding to different crossing types and traffic light sequences",
          "lesson_objectives": [
            "Identify different types of pedestrian crossings",
            "Understand traffic light sequences including filter arrows",
            "Know when to stop and proceed at crossings"
          ],
          "practical_objectives": [
            "Stop correctly at pelican crossings",
            "Navigate puffin and zebra crossings safely",
            "React to amber lights appropriately"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Urban area with crossings",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Pedestrian crossing response", "Traffic light compliance", "Amber light judgement"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": ["Mini-roundabout navigation"]
        },
        {
          "day_number": 10,
          "title": "Reversing — Left Reverse",
          "description": "Left reverse technique with constant rear observation",
          "lesson_objectives": [
            "Understand the left reverse procedure",
            "Learn the importance of constant rear observation",
            "Know speed control using clutch and brake"
          ],
          "practical_objectives": [
            "Perform left reverse with accurate positioning",
            "Maintain constant rear observation throughout",
            "Control speed using clutch and brake only"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 2.0,
          "preferred_location": "Quiet road with reference points",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Left reverse", "Rear observation", "Speed control while reversing"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["Clutch control", "1st-2nd gear change"]
        },
        {
          "day_number": 11,
          "title": "Reversing — Right Reverse & Bay Parking",
          "description": "Right reverse and reverse bay parking manoeuvres",
          "lesson_objectives": [
            "Understand right reverse procedure and reference points",
            "Learn reverse bay parking technique",
            "Know when to use all-round observations"
          ],
          "practical_objectives": [
            "Perform right reverse accurately",
            "Complete reverse bay parking into a designated bay",
            "Demonstrate effective all-round observations"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 2.0,
          "preferred_location": "Car park",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Right reverse", "Reverse bay parking", "All-round observation"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["Left reverse", "Rear observation"]
        },
        {
          "day_number": 12,
          "title": "Week 2 Theory — Hazard Perception & Awareness",
          "description": "Classroom session on hazard perception, mirror routine, and defensive driving",
          "lesson_objectives": [
            "Understand hazard perception test format and scoring",
            "Learn mirror-signal-manoeuvre in detail",
            "Know defensive driving principles",
            "Understand eyesight requirements for driving"
          ],
          "practical_objectives": [],
          "estimated_minutes": 120,
          "estimated_distance_km": 0,
          "preferred_location": "Classroom",
          "enforce_prerequisites": false,
          "is_theory": true,
          "competencies": ["Hazard perception technique", "Mirror routine knowledge", "Defensive driving awareness"],
          "difficulty": "beginner",
          "training_category": "driving",
          "prerequisite_competencies": []
        }
      ]
    },
    {
      "week_number": 3,
      "days": [
        {
          "day_number": 13,
          "title": "Three-Point Turn & Turn in the Road",
          "description": "Completing a three-point turn safely on a quiet road",
          "lesson_objectives": [
            "Understand the three-point turn procedure",
            "Learn observation requirements at each stage",
            "Know how to use full lock steering"
          ],
          "practical_objectives": [
            "Complete three-point turn without hesitation",
            "Demonstrate effective observations before each reverse",
            "Control vehicle at very low speed"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 2.0,
          "preferred_location": "Quiet wide road",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Three-point turn", "Full lock steering", "Low-speed control"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["Right reverse", "All-round observation"]
        },
        {
          "day_number": 14,
          "title": "Dual Carriageway Driving",
          "description": "Joining, driving on, and leaving dual carriageways at higher speeds",
          "lesson_objectives": [
            "Understand slip road joining procedure",
            "Learn to match speed with traffic flow",
            "Know safe following distances at higher speeds"
          ],
          "practical_objectives": [
            "Join dual carriageway smoothly using acceleration lane",
            "Maintain appropriate speed and lane position",
            "Leave dual carriageway safely using deceleration lane"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 8.0,
          "preferred_location": "Dual carriageway",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Dual carriageway joining", "High-speed lane discipline", "Speed matching"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["MSM routine"]
        },
        {
          "day_number": 15,
          "title": "Rural Roads & Bends",
          "description": "Driving on country roads with bends, crests, and narrow sections",
          "lesson_objectives": [
            "Understand appropriate speed for rural road conditions",
            "Learn to read the road ahead for bends and hazards",
            "Know positioning for left and right bends"
          ],
          "practical_objectives": [
            "Adjust speed before entering bends",
            "Position correctly for different bend types",
            "Handle narrow sections and oncoming vehicles"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 6.0,
          "preferred_location": "Country roads",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Rural road driving", "Bend negotiation", "Hazard anticipation"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["High-speed lane discipline"]
        },
        {
          "day_number": 16,
          "title": "Independent Driving",
          "description": "Following road signs and sat-nav directions independently",
          "lesson_objectives": [
            "Understand independent driving test requirements",
            "Learn to follow road signs to destinations",
            "Know how to follow sat-nav instructions"
          ],
          "practical_objectives": [
            "Follow road signs to a given destination without prompting",
            "Navigate using sat-nav while maintaining vehicle control",
            "Make own decisions at junctions and roundabouts"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 5.0,
          "preferred_location": "Mixed roads with signage",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Independent navigation", "Road sign interpretation", "Decision making"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["Roundabout lane discipline", "Junction approach"]
        },
        {
          "day_number": 17,
          "title": "Adverse Conditions & Night Driving Awareness",
          "description": "Driving considerations in rain, fog, and low-light conditions",
          "lesson_objectives": [
            "Understand stopping distances in wet/icy conditions",
            "Learn to use lights correctly in different conditions",
            "Know how to handle reduced visibility"
          ],
          "practical_objectives": [
            "Adjust driving for wet road conditions",
            "Use headlights and fog lights correctly",
            "Increase following distance in adverse conditions"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 4.0,
          "preferred_location": "Urban roads",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Adverse condition awareness", "Light usage", "Speed adjustment"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": ["Speed matching"]
        },
        {
          "day_number": 18,
          "title": "Week 3 Theory — Vehicle Basics & Test Prep",
          "description": "Classroom session on vehicle maintenance, insurance, and test structure",
          "lesson_objectives": [
            "Understand basic vehicle maintenance (tyres, lights, oil)",
            "Know insurance and documentation requirements",
            "Understand the driving test structure and format",
            "Learn about vehicle safety checks"
          ],
          "practical_objectives": [],
          "estimated_minutes": 120,
          "estimated_distance_km": 0,
          "preferred_location": "Classroom",
          "enforce_prerequisites": false,
          "is_theory": true,
          "competencies": ["Vehicle maintenance knowledge", "Documentation awareness", "Test format understanding"],
          "difficulty": "intermediate",
          "training_category": "driving",
          "prerequisite_competencies": []
        }
      ]
    },
    {
      "week_number": 4,
      "days": [
        {
          "day_number": 19,
          "title": "Mock Test Route — Part 1",
          "description": "First half of a simulated driving test route covering urban areas",
          "lesson_objectives": [
            "Understand driving test format and examiner expectations",
            "Learn common test route roads and junctions"
          ],
          "practical_objectives": [
            "Drive a test route to test standard",
            "Demonstrate all manoeuvres when requested",
            "Show confidence in independent driving"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 5.0,
          "preferred_location": "Test route — urban",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Test standard driving", "Manoeuvre execution", "Route confidence"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": ["Independent navigation"]
        },
        {
          "day_number": 20,
          "title": "Mock Test Route — Part 2",
          "description": "Second half of simulated test covering rural and complex roads",
          "lesson_objectives": [
            "Review complex junction and roundabout handling",
            "Understand minor and major fault categories"
          ],
          "practical_objectives": [
            "Complete full mock test route to test standard",
            "Handle complex junctions independently",
            "Maintain safe driving throughout varied road types"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 5.0,
          "preferred_location": "Test route — rural + urban mix",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Complex junction handling", "Consistent safe driving", "Mock test performance"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": ["Test standard driving"]
        },
        {
          "day_number": 21,
          "title": "Weak Area Practice & Refinement",
          "description": "Targeted practice on areas identified in mock tests",
          "lesson_objectives": [
            "Identify specific areas needing improvement",
            "Understand why previous errors occurred"
          ],
          "practical_objectives": [
            "Improve performance in identified weak areas",
            "Demonstrate corrected technique",
            "Build confidence in previously challenging scenarios"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 4.0,
          "preferred_location": "Varies based on weak areas",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Weak area improvement", "Error correction", "Confidence building"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": ["Complex junction handling"]
        },
        {
          "day_number": 22,
          "title": "Final Mock Test",
          "description": "Complete mock driving test under test conditions",
          "lesson_objectives": [
            "Understand test day procedures and what to expect",
            "Review all test requirements one final time"
          ],
          "practical_objectives": [
            "Complete full mock test without serious faults",
            "Demonstrate safe, confident driving throughout",
            "Show independence and decision-making ability"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 6.0,
          "preferred_location": "Full test route",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Full test standard", "Safe independent driving", "All-round observation"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": ["Weak area improvement"]
        },
        {
          "day_number": 23,
          "title": "Final Practice & Confidence Building",
          "description": "Relaxed final practice drive consolidating all skills",
          "lesson_objectives": [
            "Consolidate all learned skills",
            "Build confidence for test day"
          ],
          "practical_objectives": [
            "Drive confidently on familiar and unfamiliar roads",
            "Handle any situation independently",
            "Show calm, safe approach throughout"
          ],
          "estimated_minutes": 30,
          "estimated_distance_km": 3.0,
          "preferred_location": "Familiar area near test centre",
          "enforce_prerequisites": true,
          "is_theory": false,
          "competencies": ["Confident driving", "All-round observation", "Calm decision making"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": ["Full test standard"]
        },
        {
          "day_number": 24,
          "title": "Week 4 Theory — Test Day Review & Preparation",
          "description": "Final classroom session: test day logistics, show me/tell me questions, Q&A",
          "lesson_objectives": [
            "Review test day checklist and documentation requirements",
            "Understand eyesight test and show me/tell me questions",
            "Know what happens during and after the test",
            "Address any final questions or concerns"
          ],
          "practical_objectives": [],
          "estimated_minutes": 120,
          "estimated_distance_km": 0,
          "preferred_location": "Classroom",
          "enforce_prerequisites": false,
          "is_theory": true,
          "competencies": ["Test day preparation", "Show me/tell me knowledge", "Theory test readiness"],
          "difficulty": "advanced",
          "training_category": "driving",
          "prerequisite_competencies": []
        }
      ]
    }
  ]
}
\`\`\`

---

## Important Notes

- **Every week MUST have exactly 6 days**: Monday–Friday practical (30 min each) + Saturday theory (120 min)
- **4-week curriculum = 24 lessons total** (20 practical + 4 theory)
- **Day numbers must be sequential**: 1, 2, 3... up to 24
- **total_days = 24**, **total_weeks = 4**
- **Practical lessons**: \`is_theory: false\`, \`estimated_minutes: 30\`, \`estimated_distance_km: 2-8\`
- **Theory classes**: \`is_theory: true\`, \`estimated_minutes: 120\`, \`estimated_distance_km: 0\`, \`preferred_location: "Classroom"\`
- **Theory classes** should have empty \`practical_objectives: []\` since they are classroom-only
- **First lesson** (day 1) should always have \`enforce_prerequisites: false\` and empty \`prerequisite_competencies\`
- **Theory classes** can have \`enforce_prerequisites: false\` since they are standalone knowledge sessions
- **Competencies should build on each other** — later lessons reference earlier competencies
- **Difficulty should progress**: beginner → intermediate → advanced over the curriculum
- **Locations should progress**: parking lot → quiet residential → urban → mixed → test routes`;
    const blob = new Blob([prompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lesson_plan_template_ai_prompt.md';
    a.click();
    URL.revokeObjectURL(url);
    this.messageService.add({ severity: 'success', summary: 'Downloaded', detail: 'AI prompt document downloaded' });
  }
}
