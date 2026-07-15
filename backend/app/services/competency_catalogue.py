import uuid

from sqlalchemy import func, or_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.competency_catalogue import (
    Competency,
    CompetencyCategory,
    CompetencyDifficulty,
    CompetencyPrerequisite,
    CompetencyTrainingCategory,
    CompetencyVersion,
    CompetencyVersionStatus,
    LessonCompetencyLink,
)
from app.models.lesson_plan import LessonLibrary


# ── Version CRUD ──


async def create_version(
    db: AsyncSession,
    company_id: uuid.UUID,
    version: str,
    name: str,
    description: str | None = None,
    created_by_phone: str | None = None,
) -> CompetencyVersion:
    existing = await db.execute(
        select(CompetencyVersion).where(
            CompetencyVersion.company_id == company_id,
            CompetencyVersion.version == version,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Version '{version}' already exists for this company")

    cv = CompetencyVersion(
        company_id=company_id,
        version=version,
        name=name,
        description=description,
        status=CompetencyVersionStatus.DRAFT,
        created_by_phone=created_by_phone,
    )
    db.add(cv)
    await db.flush()
    await db.refresh(cv)
    return cv


async def list_versions(
    db: AsyncSession, company_id: uuid.UUID | None, status: str | None = None
) -> list[CompetencyVersion]:
    query = select(CompetencyVersion)
    if company_id:
        query = query.where(CompetencyVersion.company_id == company_id)
    query = query.order_by(CompetencyVersion.created_at.desc())
    if status:
        query = query.where(CompetencyVersion.status == CompetencyVersionStatus(status))

    result = await db.execute(query)
    versions = list(result.scalars().all())

    for v in versions:
        count_result = await db.execute(
            select(func.count(Competency.id)).where(
                Competency.version_id == v.id, Competency.is_active.is_(True)
            )
        )
        v.competency_count = count_result.scalar() or 0

    return versions


async def get_version(
    db: AsyncSession, version_id: uuid.UUID, company_id: uuid.UUID | None
) -> CompetencyVersion | None:
    query = (
        select(CompetencyVersion)
        .where(CompetencyVersion.id == version_id)
        .options(selectinload(CompetencyVersion.competencies))
    )
    if company_id:
        query = query.where(CompetencyVersion.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_version(
    db: AsyncSession,
    version_id: uuid.UUID,
    company_id: uuid.UUID,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
) -> CompetencyVersion:
    result = await db.execute(
        select(CompetencyVersion).where(
            CompetencyVersion.id == version_id,
            CompetencyVersion.company_id == company_id,
        )
    )
    cv = result.scalar_one_or_none()
    if not cv:
        raise ValueError("Version not found")

    if name is not None:
        cv.name = name
    if description is not None:
        cv.description = description
    if status is not None:
        cv.status = CompetencyVersionStatus(status)

    await db.flush()
    await db.refresh(cv)
    return cv


async def activate_version(
    db: AsyncSession, version_id: uuid.UUID, company_id: uuid.UUID
) -> CompetencyVersion:
    result = await db.execute(
        select(CompetencyVersion).where(
            CompetencyVersion.id == version_id,
            CompetencyVersion.company_id == company_id,
        )
    )
    cv = result.scalar_one_or_none()
    if not cv:
        raise ValueError("Version not found")

    active_result = await db.execute(
        select(CompetencyVersion).where(
            CompetencyVersion.company_id == company_id,
            CompetencyVersion.status == CompetencyVersionStatus.ACTIVE,
        )
    )
    for old in active_result.scalars().all():
        old.status = CompetencyVersionStatus.ARCHIVED

    cv.status = CompetencyVersionStatus.ACTIVE
    await db.flush()
    await db.refresh(cv)
    return cv


async def delete_version(
    db: AsyncSession, version_id: uuid.UUID, company_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(CompetencyVersion).where(
            CompetencyVersion.id == version_id,
            CompetencyVersion.company_id == company_id,
        )
    )
    cv = result.scalar_one_or_none()
    if not cv:
        raise ValueError("Version not found")
    if cv.status != CompetencyVersionStatus.DRAFT:
        raise ValueError("Only draft versions can be deleted")
    await db.delete(cv)
    await db.flush()


async def get_active_version(
    db: AsyncSession, company_id: uuid.UUID | None
) -> CompetencyVersion | None:
    query = select(CompetencyVersion).where(
        CompetencyVersion.status == CompetencyVersionStatus.ACTIVE,
    )
    if company_id:
        query = query.where(CompetencyVersion.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


# ── Category CRUD ──


async def create_category(
    db: AsyncSession,
    company_id: uuid.UUID,
    name: str,
    description: str | None = None,
    display_order: int = 0,
) -> CompetencyCategory:
    existing = await db.execute(
        select(CompetencyCategory).where(
            CompetencyCategory.company_id == company_id,
            CompetencyCategory.name == name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Category '{name}' already exists for this company")

    cat = CompetencyCategory(
        company_id=company_id,
        name=name,
        description=description,
        display_order=display_order,
    )
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def list_categories(
    db: AsyncSession, company_id: uuid.UUID | None, include_inactive: bool = False
) -> list[CompetencyCategory]:
    query = select(CompetencyCategory)
    if company_id:
        query = query.where(CompetencyCategory.company_id == company_id)
    query = query.order_by(CompetencyCategory.display_order, CompetencyCategory.name)
    if not include_inactive:
        query = query.where(CompetencyCategory.is_active.is_(True))

    result = await db.execute(query)
    cats = list(result.scalars().all())

    for c in cats:
        count_result = await db.execute(
            select(func.count(Competency.id)).where(
                Competency.category_id == c.id, Competency.is_active.is_(True)
            )
        )
        c.competency_count = count_result.scalar() or 0

    return cats


async def update_category(
    db: AsyncSession,
    category_id: uuid.UUID,
    company_id: uuid.UUID,
    name: str | None = None,
    description: str | None = None,
    display_order: int | None = None,
    is_active: bool | None = None,
) -> CompetencyCategory:
    result = await db.execute(
        select(CompetencyCategory).where(
            CompetencyCategory.id == category_id,
            CompetencyCategory.company_id == company_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise ValueError("Category not found")

    if name is not None:
        cat.name = name
    if description is not None:
        cat.description = description
    if display_order is not None:
        cat.display_order = display_order
    if is_active is not None:
        cat.is_active = is_active

    await db.flush()
    await db.refresh(cat)
    return cat


async def delete_category(
    db: AsyncSession, category_id: uuid.UUID, company_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(CompetencyCategory).where(
            CompetencyCategory.id == category_id,
            CompetencyCategory.company_id == company_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise ValueError("Category not found")

    count_result = await db.execute(
        select(func.count(Competency.id)).where(Competency.category_id == category_id)
    )
    if (count_result.scalar() or 0) > 0:
        raise ValueError("Cannot delete category with existing competencies")

    await db.delete(cat)
    await db.flush()


# ── Competency CRUD ──


async def create_competency(
    db: AsyncSession,
    company_id: uuid.UUID,
    version_id: uuid.UUID,
    category_id: uuid.UUID,
    code: str,
    name: str,
    description: str | None = None,
    learning_outcome: str | None = None,
    assessment_criteria: list[str] | None = None,
    difficulty: str = "beginner",
    estimated_practice_minutes: int | None = None,
    training_category: str = "driving",
    display_order: int = 0,
    prerequisite_ids: list[uuid.UUID] | None = None,
    created_by_phone: str | None = None,
) -> Competency:
    existing = await db.execute(
        select(Competency).where(
            Competency.company_id == company_id,
            Competency.version_id == version_id,
            Competency.code == code,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Competency code '{code}' already exists in this version")

    comp = Competency(
        company_id=company_id,
        version_id=version_id,
        category_id=category_id,
        code=code.upper(),
        name=name,
        description=description,
        learning_outcome=learning_outcome,
        assessment_criteria=assessment_criteria or [],
        difficulty=CompetencyDifficulty(difficulty),
        estimated_practice_minutes=estimated_practice_minutes,
        training_category=CompetencyTrainingCategory(training_category),
        display_order=display_order,
        created_by_phone=created_by_phone,
    )
    db.add(comp)
    await db.flush()

    if prerequisite_ids:
        for pid in prerequisite_ids:
            prereq = CompetencyPrerequisite(
                competency_id=comp.id,
                prerequisite_id=pid,
            )
            db.add(prereq)
        await db.flush()

    await db.refresh(comp)
    return comp


async def list_competencies(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    version_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    difficulty: str | None = None,
    training_category: str | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Competency], int]:
    query = select(Competency)
    if company_id:
        query = query.where(Competency.company_id == company_id)

    if version_id:
        query = query.where(Competency.version_id == version_id)
    if category_id:
        query = query.where(Competency.category_id == category_id)
    if difficulty:
        query = query.where(Competency.difficulty == CompetencyDifficulty(difficulty))
    if training_category:
        query = query.where(
            Competency.training_category == CompetencyTrainingCategory(training_category)
        )
    if is_active is not None:
        query = query.where(Competency.is_active.is_(is_active))
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Competency.code.ilike(search_pattern),
                Competency.name.ilike(search_pattern),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        query.order_by(Competency.display_order, Competency.code)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_competency(
    db: AsyncSession, competency_id: uuid.UUID, company_id: uuid.UUID | None
) -> Competency | None:
    query = (
        select(Competency)
        .where(Competency.id == competency_id)
        .options(
            selectinload(Competency.version),
            selectinload(Competency.category),
            selectinload(Competency.prerequisites),
        )
    )
    if company_id:
        query = query.where(Competency.company_id == company_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_competency(
    db: AsyncSession,
    competency_id: uuid.UUID,
    company_id: uuid.UUID,
    category_id: uuid.UUID | None = None,
    name: str | None = None,
    description: str | None = None,
    learning_outcome: str | None = None,
    assessment_criteria: list[str] | None = None,
    difficulty: str | None = None,
    estimated_practice_minutes: int | None = None,
    training_category: str | None = None,
    display_order: int | None = None,
    is_active: bool | None = None,
    prerequisite_ids: list[uuid.UUID] | None = None,
) -> Competency:
    result = await db.execute(
        select(Competency).where(
            Competency.id == competency_id,
            Competency.company_id == company_id,
        )
    )
    comp = result.scalar_one_or_none()
    if not comp:
        raise ValueError("Competency not found")

    if category_id is not None:
        comp.category_id = category_id
    if name is not None:
        comp.name = name
    if description is not None:
        comp.description = description
    if learning_outcome is not None:
        comp.learning_outcome = learning_outcome
    if assessment_criteria is not None:
        comp.assessment_criteria = assessment_criteria
    if difficulty is not None:
        comp.difficulty = CompetencyDifficulty(difficulty)
    if estimated_practice_minutes is not None:
        comp.estimated_practice_minutes = estimated_practice_minutes
    if training_category is not None:
        comp.training_category = CompetencyTrainingCategory(training_category)
    if display_order is not None:
        comp.display_order = display_order
    if is_active is not None:
        comp.is_active = is_active

    if prerequisite_ids is not None:
        await db.execute(
            delete(CompetencyPrerequisite).where(
                CompetencyPrerequisite.competency_id == comp.id
            )
        )
        for pid in prerequisite_ids:
            if pid != comp.id:
                prereq = CompetencyPrerequisite(
                    competency_id=comp.id,
                    prerequisite_id=pid,
                )
                db.add(prereq)

    await db.flush()
    await db.refresh(comp)
    return comp


async def deactivate_competency(
    db: AsyncSession, competency_id: uuid.UUID, company_id: uuid.UUID
) -> Competency:
    result = await db.execute(
        select(Competency).where(
            Competency.id == competency_id,
            Competency.company_id == company_id,
        )
    )
    comp = result.scalar_one_or_none()
    if not comp:
        raise ValueError("Competency not found")

    comp.is_active = False
    await db.flush()
    await db.refresh(comp)
    return comp


# ── Search (for lesson editor) ──


async def search_competencies(
    db: AsyncSession,
    company_id: uuid.UUID | None,
    q: str | None = None,
    category_id: uuid.UUID | None = None,
    difficulty: str | None = None,
    training_category: str | None = None,
    version_id: uuid.UUID | None = None,
) -> list[Competency]:
    query = select(Competency).where(Competency.is_active.is_(True))
    if company_id:
        query = query.where(Competency.company_id == company_id)

    if version_id:
        query = query.where(Competency.version_id == version_id)
    elif company_id:
        active_version = await get_active_version(db, company_id)
        if active_version:
            query = query.where(Competency.version_id == active_version.id)

    if q:
        search_pattern = f"%{q}%"
        query = query.where(
            or_(
                Competency.code.ilike(search_pattern),
                Competency.name.ilike(search_pattern),
                Competency.description.ilike(search_pattern),
            )
        )
    if category_id:
        query = query.where(Competency.category_id == category_id)
    if difficulty:
        query = query.where(Competency.difficulty == CompetencyDifficulty(difficulty))
    if training_category:
        query = query.where(
            Competency.training_category == CompetencyTrainingCategory(training_category)
        )

    query = (
        query.options(selectinload(Competency.category))
        .order_by(Competency.display_order, Competency.code)
        .limit(200)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Bulk Import ──


async def bulk_import(
    db: AsyncSession,
    company_id: uuid.UUID,
    competencies: list[dict],
) -> dict:
    created = 0
    skipped = 0
    errors: list[str] = []

    for idx, item in enumerate(competencies):
        try:
            existing = await db.execute(
                select(Competency).where(
                    Competency.company_id == company_id,
                    Competency.version_id == item["version_id"],
                    Competency.code == item["code"].upper(),
                )
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            await create_competency(
                db,
                company_id=company_id,
                version_id=item["version_id"],
                category_id=item["category_id"],
                code=item["code"],
                name=item["name"],
                description=item.get("description"),
                learning_outcome=item.get("learning_outcome"),
                assessment_criteria=item.get("assessment_criteria", []),
                difficulty=item.get("difficulty", "beginner"),
                estimated_practice_minutes=item.get("estimated_practice_minutes"),
                training_category=item.get("training_category", "driving"),
                display_order=item.get("display_order", idx),
            )
            created += 1
        except Exception as e:
            errors.append(f"Row {idx + 1} ({item.get('code', '?')}): {str(e)}")

    return {"created": created, "skipped": skipped, "errors": errors}


# ── Lesson ↔ Competency Links ──


async def get_lesson_competencies(
    db: AsyncSession, lesson_library_id: uuid.UUID
) -> list[dict]:
    result = await db.execute(
        select(LessonCompetencyLink)
        .where(LessonCompetencyLink.lesson_library_id == lesson_library_id)
        .options(selectinload(LessonCompetencyLink.competency).selectinload(Competency.category))
        .order_by(LessonCompetencyLink.order)
    )
    links = result.scalars().all()

    return [
        {
            "lesson_competency_id": link.id,
            "competency_id": link.competency.id,
            "code": link.competency.code,
            "name": link.competency.name,
            "category_name": link.competency.category.name if link.competency.category else None,
            "difficulty": link.competency.difficulty.value,
            "training_category": link.competency.training_category.value,
            "order": link.order,
        }
        for link in links
    ]


async def set_lesson_competencies(
    db: AsyncSession,
    lesson_library_id: uuid.UUID,
    links: list[dict],
) -> list[LessonCompetencyLink]:
    await db.execute(
        delete(LessonCompetencyLink).where(
            LessonCompetencyLink.lesson_library_id == lesson_library_id
        )
    )

    result_links = []
    for idx, link in enumerate(links):
        lc = LessonCompetencyLink(
            lesson_library_id=lesson_library_id,
            competency_id=link["competency_id"],
            order=link.get("order", idx),
        )
        db.add(lc)
        result_links.append(lc)

    await db.flush()
    return result_links


# ── Import Resolution ──


async def resolve_competency_strings(
    db: AsyncSession,
    company_id: uuid.UUID,
    competency_strings: list[str],
    version_id: uuid.UUID | None = None,
) -> tuple[list[uuid.UUID], list[str]]:
    """Resolve competency text strings to UUIDs. Returns (matched_ids, missing_strings)."""
    if not competency_strings:
        return [], []

    if version_id is None:
        active_version = await get_active_version(db, company_id)
        if not active_version:
            return [], competency_strings
        version_id = active_version.id

    all_result = await db.execute(
        select(Competency).where(
            Competency.company_id == company_id,
            Competency.version_id == version_id,
            Competency.is_active.is_(True),
        )
    )
    all_competencies = {c.code.upper(): c for c in all_result.scalars().all()}
    name_index = {c.name.lower(): c for c in all_competencies.values()}

    matched_ids = []
    missing = []

    for text in competency_strings:
        text_upper = text.strip().upper()
        text_lower = text.strip().lower()

        if text_upper in all_competencies:
            matched_ids.append(all_competencies[text_upper].id)
        elif text_lower in name_index:
            matched_ids.append(name_index[text_lower].id)
        else:
            missing.append(text)

    return matched_ids, missing
