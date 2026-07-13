"""Tenant isolation utilities for multi-company SaaS."""

import uuid
from typing import TypeVar

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Branch, Company
from app.models.user import User, UserRole

M = TypeVar("M")


def add_company_filter(
    query: Select,
    model: type[M],
    user: User,
    company_id_col=None,
) -> Select:
    """Add a company_id WHERE clause unless the user is super_admin.

    Usage:
        query = add_company_filter(select(Product), Product, user)
        query = add_company_filter(select(Vehicle), Vehicle, user)
    """
    if user.role == UserRole.SUPER_USER:
        return query
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
    if user.role == UserRole.SUPER_USER:
        return query
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
    if user.role == UserRole.SUPER_USER:
        return query
    if user.company_id is None:
        return query

    # Apply joins
    current_query = query
    for target_model, fk_col in join_path:
        current_query = current_query.join(target_model, fk_col == target_model.id)

    return current_query.where(Product.company_id == user.company_id)


def company_id_column(user: User) -> uuid.UUID | None:
    """Get the effective company_id for filtering (None for super_admin)."""
    if user.role == UserRole.SUPER_USER:
        return None
    return user.company_id


async def resolve_company_id(db: AsyncSession, user: User) -> uuid.UUID | None:
    """Resolve a company_id for create operations.

    For regular users returns their own company_id.
    For super_users (who have no company_id) looks up the first company
    so they can create tenant-scoped records.
    Returns None only if no company exists at all.
    """
    if user.company_id is not None:
        return user.company_id
    if user.role == UserRole.SUPER_USER:
        result = await db.execute(select(Company.id).limit(1))
        company = result.scalar_one_or_none()
        if company is not None:
            return company
    return None
