import uuid

from pydantic import BaseModel


class PermissionGroupRead(BaseModel):
    key: str
    label: str
    codes: list[str]


class RolePermissionsRead(BaseModel):
    role: str
    permissions: list[str]


class CompanyMatrixRead(BaseModel):
    company_id: uuid.UUID
    matrix: dict[str, list[str]]


class RolePermissionsUpdate(BaseModel):
    permissions: list[str]
