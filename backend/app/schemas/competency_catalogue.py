import uuid
from datetime import datetime

from pydantic import BaseModel


# ── Competency Version ──

class CompetencyVersionCreate(BaseModel):
    version: str
    name: str
    description: str | None = None


class CompetencyVersionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


class CompetencyVersionRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    version: str
    name: str
    description: str | None
    status: str
    competency_count: int = 0
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Competency Category ──

class CompetencyCategoryCreate(BaseModel):
    name: str
    description: str | None = None
    display_order: int = 0


class CompetencyCategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class CompetencyCategoryRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    description: str | None
    display_order: int
    is_active: bool
    competency_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Competency ──

class CompetencyCreate(BaseModel):
    version_id: uuid.UUID
    category_id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    learning_outcome: str | None = None
    assessment_criteria: list[str] = []
    difficulty: str = "beginner"
    estimated_practice_minutes: int | None = None
    training_category: str = "driving"
    display_order: int = 0
    prerequisite_ids: list[uuid.UUID] = []


class CompetencyUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = None
    description: str | None = None
    learning_outcome: str | None = None
    assessment_criteria: list[str] | None = None
    difficulty: str | None = None
    estimated_practice_minutes: int | None = None
    training_category: str | None = None
    display_order: int | None = None
    is_active: bool | None = None
    prerequisite_ids: list[uuid.UUID] | None = None


class CompetencyRead(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    category_id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    description: str | None
    learning_outcome: str | None
    assessment_criteria: list | None
    difficulty: str
    estimated_practice_minutes: int | None
    training_category: str
    display_order: int
    is_active: bool
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompetencyReadWithRelations(BaseModel):
    id: uuid.UUID
    version_id: uuid.UUID
    category_id: uuid.UUID
    company_id: uuid.UUID
    code: str
    name: str
    description: str | None
    learning_outcome: str | None
    assessment_criteria: list | None
    difficulty: str
    estimated_practice_minutes: int | None
    training_category: str
    display_order: int
    is_active: bool
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime
    version: CompetencyVersionRead | None = None
    category: CompetencyCategoryRead | None = None
    prerequisites: list["CompetencyRead"] = []

    model_config = {"from_attributes": True}


# ── Lesson ↔ Competency Links ──

class LessonCompetencyLink(BaseModel):
    competency_id: uuid.UUID
    order: int = 0


class LessonCompetencyRead(BaseModel):
    lesson_competency_id: uuid.UUID
    competency_id: uuid.UUID
    code: str
    name: str
    category_name: str | None = None
    difficulty: str
    training_category: str
    order: int


# ── Bulk Import ──

class CompetencyBulkImportItem(BaseModel):
    version_id: uuid.UUID
    category_id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    learning_outcome: str | None = None
    assessment_criteria: list[str] = []
    difficulty: str = "beginner"
    estimated_practice_minutes: int | None = None
    training_category: str = "driving"
    display_order: int = 0


class CompetencyBulkImportRequest(BaseModel):
    competencies: list[CompetencyBulkImportItem]


class CompetencyBulkImportResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]
