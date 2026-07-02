import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    competency_level: int = 1
    order: int = 0


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    competency_level: int | None = None
    achieved: bool | None = None
    order: int | None = None


class SkillRead(BaseModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    name: str
    description: str | None
    competency_level: int
    achieved: bool
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TrainingSessionCreate(BaseModel):
    session_date: datetime
    duration_minutes: int = 120
    theory_minutes: int | None = None
    driving_minutes: int | None = None
    notes: str | None = None
    instructor_notes: str | None = None
    video_url: str | None = None
    skills: list[SkillCreate] = []


class TrainingSessionUpdate(BaseModel):
    session_date: datetime | None = None
    duration_minutes: int | None = None
    theory_minutes: int | None = None
    driving_minutes: int | None = None
    notes: str | None = None
    instructor_notes: str | None = None
    video_url: str | None = None


class TrainingSessionRead(BaseModel):
    id: uuid.UUID
    cart_item_id: uuid.UUID
    session_date: datetime
    duration_minutes: int
    theory_minutes: int | None
    driving_minutes: int | None
    notes: str | None
    instructor_notes: str | None
    lesson_plan_id: str | None
    video_url: str | None
    video_cached: bool
    video_invalidated: bool
    started_at: datetime | None
    started_by: str | None
    timer_seconds: int | None
    timer_started_at: datetime | None
    skills: list[SkillRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateSessionsRequest(BaseModel):
    start_date: datetime
    driving_per_session_minutes: int = 120
    theory_per_session_minutes: int = 60


class TrainingSummary(BaseModel):
    total_driving_minutes: int = 0
    total_theory_minutes: int = 0
    sessions_count: int = 0
    expected_driving_minutes: int | None = None
    expected_theory_minutes: int | None = None
    driving_remaining_minutes: int | None = None
    theory_remaining_minutes: int | None = None
