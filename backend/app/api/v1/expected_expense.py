import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.company import ExpenseCategory
from app.models.user import User
from app.schemas.expected_expense import (
    ExpectedExpenseItemCreate,
    ExpectedExpenseItemRead,
    ExpectedExpenseItemUpdate,
    PackageExpectedExpensesRead,
    PackageExpenseLinkSetInput,
)
from app.services import expected_expense as service
from app.utils.tenant import resolve_company_id

router = APIRouter()


@router.get(
    "/expected-expenses/",
    response_model=list[ExpectedExpenseItemRead],
)
async def list_expected_expenses(
    active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.expected_expenses")),
):
    company_id = await resolve_company_id(db, current_user)
    items = await service.list_items(
        db, company_id, active_only=bool(active)
    )
    return [
        ExpectedExpenseItemRead.model_validate(i).model_copy(
            update={"category_name": (await _category_name(db, i.category_id))}
        )
        for i in items
    ]


@router.post(
    "/expected-expenses/",
    response_model=ExpectedExpenseItemRead,
    status_code=201,
)
async def create_expected_expense(
    data: ExpectedExpenseItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    company_id = await resolve_company_id(db, current_user)
    item = await service.create_item(
        db, company_id, data.model_dump(), created_by=current_user.phone
    )
    await db.commit()
    return ExpectedExpenseItemRead.model_validate(item).model_copy(
        update={"category_name": await _category_name(db, item.category_id)}
    )


@router.patch(
    "/expected-expenses/{item_id}",
    response_model=ExpectedExpenseItemRead,
)
async def update_expected_expense(
    item_id: uuid.UUID,
    data: ExpectedExpenseItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    company_id = await resolve_company_id(db, current_user)
    item = await service.get_item(db, item_id)
    if not item or item.company_id != company_id:
        raise HTTPException(status_code=404, detail="Expected expense item not found")
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    item = await service.update_item(db, item, payload)
    await db.commit()
    await db.refresh(item)
    return ExpectedExpenseItemRead.model_validate(item).model_copy(
        update={"category_name": await _category_name(db, item.category_id)}
    )


@router.delete("/expected-expenses/{item_id}", status_code=204)
async def delete_expected_expense(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    company_id = await resolve_company_id(db, current_user)
    item = await service.get_item(db, item_id)
    if not item or item.company_id != company_id:
        raise HTTPException(status_code=404, detail="Expected expense item not found")
    await service.delete_item(db, item)
    await db.commit()


@router.get(
    "/expected-expenses/package/{package_id}",
    response_model=PackageExpectedExpensesRead,
)
async def get_package_expected_expenses(
    package_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.expected_expenses")),
):
    company_id = await resolve_company_id(db, current_user)
    result = await service.get_package_links(db, package_id, company_id)
    return PackageExpectedExpensesRead(**result)


@router.put(
    "/expected-expenses/package/{package_id}",
    response_model=PackageExpectedExpensesRead,
)
async def set_package_expected_expenses(
    package_id: uuid.UUID,
    data: PackageExpenseLinkSetInput,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.manage")),
):
    company_id = await resolve_company_id(db, current_user)
    result = await service.set_package_links(
        db,
        package_id,
        company_id,
        [l.model_dump() for l in data.links],
    )
    await db.commit()
    return PackageExpectedExpensesRead(**result)


@router.get(
    "/expected-expenses/categories",
)
async def list_expected_expense_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("expenses.expected_expenses")),
):
    company_id = await resolve_company_id(db, current_user)
    rows = (
        await db.execute(
            select(ExpenseCategory)
            .where(ExpenseCategory.company_id == company_id)
            .order_by(ExpenseCategory.name.asc())
        )
    ).scalars().all()
    return [
        {"id": str(c.id), "name": c.name, "code": c.code, "account": c.account}
        for c in rows
    ]


async def _category_name(db: AsyncSession, category_id: uuid.UUID | None) -> str | None:
    if not category_id:
        return None
    from sqlalchemy import select
    cat = (
        await db.execute(
            select(ExpenseCategory).where(ExpenseCategory.id == category_id)
        )
    ).scalar_one_or_none()
    return cat.name if cat else None
