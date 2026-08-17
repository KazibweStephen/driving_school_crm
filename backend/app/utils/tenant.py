"""Tenant isolation utilities for multi-company SaaS."""

import uuid
from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Branch, Company, UserBranchAssignment
from app.models.user import User, UserRole

M = TypeVar("M")


def add_company_filter(
    query: Select,
    model: type[M],
    user: User,
    company_id_col=None,
) -> Select:
    """Add a company_id WHERE clause for the user's effective company.

    Usage:
        query = add_company_filter(select(Product), Product, user)
        query = add_company_filter(select(Vehicle), Vehicle, user)
    """
    col = company_id_col or getattr(model, "company_id", None)
    if col is not None and user.company_id is not None:
        return query.where(col == user.company_id)
    return query


def add_branch_company_filter(
    query: Select,
    model: type[M],
    user: User,
    branch_id_col=None,
) -> Select:
    """Add a company_id filter via branch join for branch-scoped models.

    Joins through the Branch table to filter by company_id.
    Handles the join gracefully if already present.

    Usage:
        query = add_branch_company_filter(select(Consultation), Consultation, user)
        query = add_branch_company_filter(select(Expense), Expense, user)
    """
    col = branch_id_col or getattr(model, "branch_id", None)
    if col is None or user.company_id is None:
        return query
    # Join Branch and filter by the user's company
    query = query.join(Branch, col == Branch.id)
    return query.where(Branch.company_id == user.company_id)


def add_company_filter_from_relationship(
    query: Select,
    model: type[M],
    user: User,
    join_path,
) -> Select:
    """Add a company_id filter via a relationship path.

    For models that belong to a company through a chain of relationships.
    The join_path should be a list of (model, fk_column) tuples.

    Usage:
        # Package -> Product -> Company
        query = add_company_filter_from_relationship(
            select(Package), user,
            [(Product, Package.product_id)]
        )
    """
    if user.company_id is None:
        return query

    # Apply joins
    current_query = query
    for target_model, fk_col in join_path:
        current_query = current_query.join(target_model, fk_col == target_model.id)

    return current_query.where(Product.company_id == user.company_id)


def company_id_column(user: User) -> uuid.UUID | None:
    """Get the effective company_id for filtering.

    For a super admin with an active company selected this returns the active
    company; for everyone else their stored company_id (None when unscoped).
    """
    active = getattr(user, "active_company_id", None)
    if active is not None:
        return active
    return user.company_id


async def resolve_company_id(db: AsyncSession, user: User) -> uuid.UUID | None:
    """Resolve a company_id for create operations.

    For regular users returns their own company_id. For super_users the
    session's active company is used, falling back to the first company so they
    can always create tenant-scoped records. Returns None only if no company
    exists at all.
    """
    active = getattr(user, "active_company_id", None)
    if active is not None:
        return active
    if user.company_id is not None:
        return user.company_id
    if user.role == UserRole.SUPER_USER:
        result = await db.execute(select(Company.id).limit(1))
        company = result.scalar_one_or_none()
        if company is not None:
            return company
    return None


async def resolve_branch_ids(
    db: AsyncSession,
    current_user: User,
    requested_branch_ids: list[uuid.UUID] | None = None,
) -> list[uuid.UUID]:
    """Resolve the branch IDs a user may access for list views.

    - Privileged users (super_user, office_admin, manager, branch_supervisor):
      requested IDs are validated against the company; if none requested,
      all company branches are returned.
    - Non-privileged users: requested IDs must be a subset of their assigned
      branches; if none requested, their assigned branches are returned.
    """
    is_privileged = current_user.role in (
        UserRole.SUPER_USER,
        UserRole.OFFICE_ADMIN,
        UserRole.MANAGER,
        UserRole.BRANCH_SUPERVISOR,
    )

    base_query = select(Branch)
    if current_user.company_id is not None:
        base_query = base_query.where(Branch.company_id == current_user.company_id)

    if is_privileged:
        if not requested_branch_ids:
            result = await db.execute(base_query)
            return [b.id for b in result.scalars().all()]
        result = await db.execute(
            base_query.where(Branch.id.in_(requested_branch_ids))
        )
        resolved = [b.id for b in result.scalars().all()]
        if not resolved:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="No branch access"
            )
        return resolved

    assignment_query = (
        select(UserBranchAssignment.branch_id)
        .join(Branch, UserBranchAssignment.branch_id == Branch.id)
        .where(UserBranchAssignment.user_id == current_user.phone)
    )
    if current_user.company_id is not None:
        assignment_query = assignment_query.where(
            Branch.company_id == current_user.company_id
        )

    result = await db.execute(assignment_query)
    assigned = [row[0] for row in result.all()]
    if not assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No branch access"
        )

    if requested_branch_ids:
        valid = set(requested_branch_ids) & set(assigned)
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="No branch access"
            )
        return list(valid)

    return assigned
