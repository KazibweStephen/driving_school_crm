import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.user import UserRole, UserStatus


class UserCreate(BaseModel):
    phone: str = Field(..., pattern=r"^\d{7,15}$")
    name: str = Field(..., min_length=1, max_length=100)
    role: UserRole = UserRole.OFFICE_ADMIN
    company_id: uuid.UUID | None = None
    is_company_admin: bool = False
    can_backdate: bool = False


class UserRead(BaseModel):
    phone: str
    name: str
    role: UserRole
    status: UserStatus
    is_company_admin: bool
    can_backdate: bool
    company_id: uuid.UUID | None = None
    created_by_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    role: UserRole | None = None
    status: UserStatus | None = None
    company_id: uuid.UUID | None = None
    is_company_admin: bool | None = None
    can_backdate: bool | None = None


class UserPinChange(BaseModel):
    old_pin: str = Field(..., min_length=4, max_length=4)
    new_pin: str = Field(..., min_length=4, max_length=4)


class UserListParams(BaseModel):
    search: str | None = Field(None, max_length=50)
    role: UserRole | None = None
    status: UserStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class UserListResponse(BaseModel):
    users: list[UserRead]
    total: int
    page: int
    page_size: int
    total_pages: int
