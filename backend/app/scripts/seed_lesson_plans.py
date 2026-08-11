"""Seed default lesson-plan templates and lesson-library entries from curricula-pack-v1.

Usage:
    docker compose exec backend python -m app.scripts.seed_lesson_plans
"""
import asyncio
import json
import os
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.database import async_session
from app.models.company import Company
from app.models.competency_catalogue import Competency, LessonCompetencyLink
from app.models.lesson_plan import (
    EntityStatus,
    LessonDifficulty,
    LessonLibrary,
    LessonPlanTemplate,
    LessonTemplateItem,
    TransmissionType,
)

CURRICULA_DIR = Path(__file__).resolve().parent.parent / "curricula-pack-v1"


def _load_curricula() -> list[dict]:
    curricula = []
    if not CURRICULA_DIR.exists():
        print(f"  Curricula directory not found: {CURRICULA_DIR}")
        return curricula
    for path in sorted(CURRICULA_DIR.glob("*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["_source_file"] = path.name
            curricula.append(data)
        except Exception as exc:
            print(f"  Failed to load {path}: {exc}")
    return curricula


def _difficulty(value: str | None) -> LessonDifficulty:
    mapping = {
        "beginner": LessonDifficulty.BEGINNER,
        "intermediate": LessonDifficulty.INTERMEDIATE,
        "advanced": LessonDifficulty.ADVANCED,
    }
    return mapping.get((value or "").lower(), LessonDifficulty.BEGINNER)


def _transmission(value: str | None) -> TransmissionType:
    mapping = {
        "manual": TransmissionType.MANUAL,
        "automatic": TransmissionType.AUTOMATIC,
        "both": TransmissionType.BOTH,
    }
    return mapping.get((value or "").lower(), TransmissionType.MANUAL)


async def seed_company_lesson_plans(db, company_id: uuid.UUID) -> bool:
    """Seed lesson plans and lesson-library entries for a single company.

    Returns True if any templates were created.
    """
    existing = await db.execute(
        select(LessonPlanTemplate).where(LessonPlanTemplate.company_id == company_id).limit(1)
    )
    if existing.scalar_one_or_none():
        print(f"  Company {company_id} already has lesson plan templates, skipping.")
        return False

    curricula = _load_curricula()
    if not curricula:
        print(f"  No curricula found to seed for company {company_id}.")
        return False

    # Pre-load competency IDs for this company by code.
    comp_result = await db.execute(
        select(Competency).where(Competency.company_id == company_id)
    )
    competency_by_code = {c.code: c.id for c in comp_result.scalars().all()}

    created_templates = 0
    for curriculum in curricula:
        template = LessonPlanTemplate(
            company_id=company_id,
            name=curriculum.get("title", "Untitled Curriculum"),
            transmission_type=_transmission(curriculum.get("transmission_type")),
            description=curriculum.get("description"),
            total_days=curriculum.get("total_days", 20),
            total_weeks=curriculum.get("total_weeks", 4),
            status=EntityStatus.ACTIVE,
            is_locked=False,
            template_type=curriculum.get("template_type", "practical"),
            created_by_phone="0782832711",
        )
        db.add(template)
        await db.flush()
        created_templates += 1

        item_count = 0
        for week in curriculum.get("weeks", []):
            week_number = week.get("week_number", 1)
            for day in week.get("days", []):
                day_number = day.get("day_number", item_count + 1)

                # Create a corresponding lesson-library entry.
                lesson = LessonLibrary(
                    company_id=company_id,
                    title=day.get("title", f"Day {day_number}"),
                    description=day.get("description"),
                    transmission_type=template.transmission_type,
                    lesson_objectives=day.get("lesson_objectives") or [],
                    practical_objectives=day.get("practical_objectives") or [],
                    estimated_minutes=day.get("estimated_minutes", 30),
                    estimated_distance_km=day.get("estimated_distance_km", 0) or 0,
                    preferred_location=day.get("preferred_location"),
                    difficulty=_difficulty(day.get("difficulty")),
                    status=EntityStatus.ACTIVE,
                    lesson_number=day_number,
                    day_number=day_number,
                    week_number=week_number,
                    order=day_number,
                    training_category=day.get("training_category", "driving"),
                    is_theory=bool(day.get("is_theory")),
                    created_by_phone="0782832711",
                )
                db.add(lesson)
                await db.flush()

                # Link competencies by code.
                for order, code in enumerate(day.get("competencies", [])):
                    comp_id = competency_by_code.get(code)
                    if comp_id:
                        link = LessonCompetencyLink(
                            lesson_library_id=lesson.id,
                            competency_id=comp_id,
                            order=order,
                        )
                        db.add(link)
                    else:
                        print(f"    Warning: competency {code} not found for company {company_id}")

                item = LessonTemplateItem(
                    template_id=template.id,
                    day_number=day_number,
                    week_number=week_number,
                    title=lesson.title,
                    lesson_objectives=lesson.lesson_objectives,
                    practical_objectives=lesson.practical_objectives,
                    estimated_minutes=lesson.estimated_minutes,
                    estimated_distance_km=lesson.estimated_distance_km,
                    order=day_number,
                    lesson_library_id=lesson.id,
                    preferred_location=lesson.preferred_location,
                    enforce_prerequisites=bool(day.get("enforce_prerequisites", True)),
                    is_theory=lesson.is_theory,
                )
                db.add(item)
                item_count += 1

        print(
            f"  Seeded template '{template.name}' with {item_count} item(s) "
            f"for company {company_id}."
        )

    await db.commit()
    print(f"  Seeded {created_templates} lesson plan template(s) for company {company_id}.")
    return True


async def seed():
    async with async_session() as db:
        result = await db.execute(select(Company))
        companies = list(result.scalars().all())

        for company in companies:
            print(f"\nSeeding lesson plans for company {company.id} ({company.name})...")
            await seed_company_lesson_plans(db, company.id)

        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
