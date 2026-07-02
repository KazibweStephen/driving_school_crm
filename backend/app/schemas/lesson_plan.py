import uuid
from datetime import datetime

from pydantic import BaseModel


# ── Video Library ──

class VideoLibraryCreate(BaseModel):
    title: str
    source: str
    url: str | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    qr_code_data: str | None = None


class VideoLibraryUpdate(BaseModel):
    title: str | None = None
    source: str | None = None
    url: str | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None
    qr_code_data: str | None = None


class VideoLibraryRead(BaseModel):
    id: uuid.UUID
    title: str
    source: str
    url: str | None
    file_path: str | None
    file_size: int | None
    mime_type: str | None
    duration_seconds: int | None
    thumbnail_url: str | None
    qr_code_data: str | None
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Lesson Library ──

class LessonLibraryCreate(BaseModel):
    title: str
    description: str | None = None
    transmission_type: str | None = None
    lesson_objectives: list[str] = []
    practical_objectives: list[str] = []
    competencies: list[str] = []
    estimated_minutes: int = 30
    estimated_distance_km: float = 3.0
    required_vehicle: str | None = None
    difficulty: str = "beginner"
    lesson_number: int | None = None
    day_number: int | None = None
    week_number: int | None = None
    order: int | None = None
    video_ids: list[uuid.UUID] = []
    preferred_location: str | None = None
    training_category: str = "driving"
    prerequisite_competencies: list[str] = []
    prerequisite_lesson_ids: list[uuid.UUID] = []


class LessonLibraryUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    transmission_type: str | None = None
    lesson_objectives: list[str] | None = None
    practical_objectives: list[str] | None = None
    competencies: list[str] | None = None
    estimated_minutes: int | None = None
    estimated_distance_km: float | None = None
    required_vehicle: str | None = None
    difficulty: str | None = None
    status: str | None = None
    lesson_number: int | None = None
    day_number: int | None = None
    week_number: int | None = None
    order: int | None = None
    preferred_location: str | None = None
    training_category: str | None = None
    prerequisite_competencies: list[str] | None = None
    prerequisite_lesson_ids: list[uuid.UUID] | None = None


class LessonLibraryRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    transmission_type: str | None
    lesson_objectives: list[str]
    practical_objectives: list[str]
    competencies: list[str]
    estimated_minutes: int
    estimated_distance_km: float
    required_vehicle: str | None
    difficulty: str
    status: str
    lesson_number: int | None
    day_number: int | None
    week_number: int | None
    order: int | None
    videos: list[VideoLibraryRead] = []
    preferred_location: str | None
    training_category: str
    prerequisite_competencies: list[str]
    prerequisite_lessons: list["LessonLibraryPrerequisiteRead"] = []
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LessonLibraryPrerequisiteRead(BaseModel):
    id: uuid.UUID
    title: str
    lesson_number: int | None

    model_config = {"from_attributes": True}


# ── Lesson Plan Template ──

class LessonTemplateItemCreate(BaseModel):
    day_number: int
    week_number: int
    title: str
    lesson_objectives: list[str] = []
    practical_objectives: list[str] = []
    estimated_minutes: int = 30
    estimated_distance_km: float = 3.0
    order: int = 0
    lesson_library_id: uuid.UUID | None = None
    preferred_location: str | None = None
    enforce_prerequisites: bool = True


class LessonTemplateItemUpdate(BaseModel):
    day_number: int | None = None
    week_number: int | None = None
    title: str | None = None
    lesson_objectives: list[str] | None = None
    practical_objectives: list[str] | None = None
    estimated_minutes: int | None = None
    estimated_distance_km: float | None = None
    order: int | None = None
    lesson_library_id: uuid.UUID | None = None
    preferred_location: str | None = None
    enforce_prerequisites: bool | None = None


class LessonTemplateItemRead(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    day_number: int
    week_number: int
    title: str
    lesson_objectives: list[str]
    practical_objectives: list[str]
    estimated_minutes: int
    estimated_distance_km: float
    order: int
    lesson_library_id: uuid.UUID | None = None
    preferred_location: str | None = None
    enforce_prerequisites: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LessonPlanTemplateCreate(BaseModel):
    name: str
    transmission_type: str
    description: str | None = None
    total_days: int = 20
    total_weeks: int = 4
    items: list[LessonTemplateItemCreate] = []


class LessonPlanTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    total_days: int | None = None
    total_weeks: int | None = None
    status: str | None = None
    is_locked: bool | None = None


class LessonPlanTemplateRead(BaseModel):
    id: uuid.UUID
    name: str
    transmission_type: str
    description: str | None
    total_days: int
    total_weeks: int
    status: str
    is_locked: bool
    lesson_items: list[LessonTemplateItemRead] = []
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Client Lesson Plan ──

class ClientLessonCreate(BaseModel):
    day_number: int
    week_number: int
    title: str
    lesson_objectives: list[str] = []
    practical_objectives: list[str] = []
    order: int = 0
    is_active: bool = True
    preferred_location: str | None = None
    enforce_prerequisites: bool = True


class ClientLessonUpdate(BaseModel):
    day_number: int | None = None
    week_number: int | None = None
    title: str | None = None
    lesson_objectives: list[str] | None = None
    practical_objectives: list[str] | None = None
    order: int | None = None
    is_active: bool | None = None
    is_locked: bool | None = None
    status: str | None = None
    difficulty: str | None = None
    driving_minutes: int | None = None
    theory_minutes: int | None = None
    mileage_km: float | None = None
    combined_with_next: bool | None = None
    skills_achieved: list | None = None
    outcome: str | None = None
    instructor_id: str | None = None
    vehicle_id: str | None = None
    notes: str | None = None
    preferred_location: str | None = None
    enforce_prerequisites: bool | None = None


class ClientLessonRead(BaseModel):
    id: uuid.UUID
    lesson_plan_id: uuid.UUID
    template_item_id: uuid.UUID | None
    lesson_library_id: uuid.UUID | None
    day_number: int
    week_number: int
    title: str
    lesson_objectives: list[str]
    practical_objectives: list[str]
    order: int
    is_active: bool
    is_locked: bool
    status: str
    difficulty: str | None
    driving_minutes: int | None
    theory_minutes: int | None
    mileage_km: float | None
    combined_with_next: bool
    skills_achieved: list | None
    outcome: str | None
    instructor_id: str | None
    vehicle_id: str | None
    completed_at: datetime | None
    notes: str | None
    preferred_location: str | None
    enforce_prerequisites: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientLessonPlanCreate(BaseModel):
    template_id: str | None = None
    transmission_type: str
    start_date: datetime | None = None
    notes: str | None = None
    lessons: list[ClientLessonCreate] = []


class ClientLessonPlanUpdate(BaseModel):
    start_date: datetime | None = None
    status: str | None = None
    purchased_days: int | None = None
    notes: str | None = None


class ClientLessonPlanRead(BaseModel):
    id: uuid.UUID
    cart_item_id: uuid.UUID
    template_id: uuid.UUID | None
    transmission_type: str
    start_date: datetime | None
    status: str
    purchased_days: int | None
    auto_generated: bool
    notes: str | None
    lessons: list[ClientLessonRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Reorder / Bulk Update ──

class LessonReorderItem(BaseModel):
    id: uuid.UUID
    order: int
    week_number: int | None = None
    day_number: int | None = None


class LessonBulkReorder(BaseModel):
    lessons: list[LessonReorderItem]


# ── Client Lesson Checklist ──

class ClientLessonChecklistCreate(BaseModel):
    checklist_type: str
    item_label: str
    order: int = 0


class ClientLessonChecklistUpdate(BaseModel):
    item_label: str | None = None
    is_checked: bool | None = None
    checked_by: str | None = None
    order: int | None = None


class ClientLessonChecklistRead(BaseModel):
    id: uuid.UUID
    client_lesson_id: uuid.UUID
    checklist_type: str
    item_label: str
    is_checked: bool
    checked_by: str | None
    checked_at: datetime | None
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientLessonChecklistBatchUpdate(BaseModel):
    items: list[ClientLessonChecklistUpdate]


# ── Client Lesson Competency ──

class ClientLessonCompetencyCreate(BaseModel):
    competency_name: str
    level: str = "not_started"
    notes: str | None = None
    order: int = 0


class ClientLessonCompetencyUpdate(BaseModel):
    level: str | None = None
    notes: str | None = None
    order: int | None = None


class ClientLessonCompetencyRead(BaseModel):
    id: uuid.UUID
    client_lesson_id: uuid.UUID
    competency_name: str
    level: str
    notes: str | None
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Client Lesson Timer ──

class ClientLessonTimerSync(BaseModel):
    total_seconds: int
    distance_km: float | None = None


class ClientLessonTimerRead(BaseModel):
    id: uuid.UUID
    client_lesson_id: uuid.UUID
    started_at: datetime | None
    started_by: str | None
    paused_at: datetime | None
    paused_by: str | None
    total_seconds: int
    distance_km: float
    elapsed_minutes: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Theory Session ──

class TheorySessionCreate(BaseModel):
    week_number: int
    session_date: datetime
    duration_minutes: int = 120
    topic: str | None = None
    video_ids: list[uuid.UUID] = []
    slides_url: str | None = None
    quiz_data: list[dict] = []
    instructor_id: str | None = None


class TheorySessionUpdate(BaseModel):
    session_date: datetime | None = None
    duration_minutes: int | None = None
    topic: str | None = None
    video_ids: list[uuid.UUID] | None = None
    slides_url: str | None = None
    quiz_data: list[dict] | None = None
    attendance_list: list[dict] | None = None
    instructor_id: str | None = None
    status: str | None = None
    notes: str | None = None


class TheorySessionRead(BaseModel):
    id: uuid.UUID
    lesson_plan_id: uuid.UUID
    week_number: int
    session_date: datetime
    duration_minutes: int
    topic: str | None
    video_ids: list
    slides_url: str | None
    quiz_data: list
    attendance_list: list
    instructor_id: str | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TheorySessionGenerateRequest(BaseModel):
    start_date: datetime
    total_weeks: int = 4
    session_duration_minutes: int = 120


# ── Lesson History ──

class LessonHistoryRead(BaseModel):
    id: uuid.UUID
    client_lesson_id: uuid.UUID
    from_state: str | None
    to_state: str | None
    changed_by: str | None
    change_reason: str | None
    metadata_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Import Log ──

class ImportLogRead(BaseModel):
    id: uuid.UUID
    import_type: str
    file_name: str | None
    status: str
    error_message: str | None
    created_by_phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Instructor Qualification ──

class InstructorQualificationCreate(BaseModel):
    instructor_phone: str
    transmission_type: str
    is_certified: bool = False
    certified_at: datetime | None = None
    expires_at: datetime | None = None
    notes: str | None = None


class InstructorQualificationUpdate(BaseModel):
    is_certified: bool | None = None
    certified_at: datetime | None = None
    expires_at: datetime | None = None
    notes: str | None = None


class InstructorQualificationRead(BaseModel):
    id: uuid.UUID
    instructor_phone: str
    transmission_type: str
    is_certified: bool
    certified_at: datetime | None
    expires_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Vehicle ──

class VehicleCreate(BaseModel):
    name: str
    plate_number: str
    transmission: str
    notes: str | None = None


class VehicleUpdate(BaseModel):
    name: str | None = None
    plate_number: str | None = None
    transmission: str | None = None
    status: str | None = None
    notes: str | None = None


class VehicleRead(BaseModel):
    id: uuid.UUID
    name: str
    plate_number: str
    transmission: str
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Lesson Plan Duplicate ──

class DuplicateLessonPlanRequest(BaseModel):
    name: str
    include_items: bool = True


# ── Import/Export ──

class LessonPlanImportValidate(BaseModel):
    valid: bool
    errors: list[dict] = []
    warnings: list[dict] = []


class LessonPlanImportResponse(BaseModel):
    template: LessonPlanTemplateRead | None = None
    import_log: ImportLogRead | None = None
    validation: LessonPlanImportValidate | None = None
