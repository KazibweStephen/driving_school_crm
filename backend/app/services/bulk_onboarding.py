import math
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException

from app.models.cart import CartItem, CartItemStatus
from app.models.company import Branch
from app.models.consultation import Consultation, ConsultationStatus
from app.models.discount import (
    CartItemDiscount,
    Discount,
    DiscountAppliesTo,
    DiscountStatus,
)
from app.models.lesson_plan import (
    ClientLesson,
    ClientLessonPlan,
    LessonPlanStatus,
    LessonState,
    LessonTemplateItem,
    TransmissionType,
)
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.product import Package
from app.models.training import TrainingSession
from app.schemas.bulk_onboarding import BulkOnboardingRequest
from app.services.commission import create_commission_from_conversion
from app.services.discount import compute_discount_amount
from app.services.payment import _generate_system_receipt_number, generate_transaction_id


def _effective_price(package_price: Decimal, applied_amount: Decimal) -> Decimal:
    return max(Decimal("0"), package_price - applied_amount)


async def bulk_onboard_clients(
    db: AsyncSession,
    user,
    data: BulkOnboardingRequest,
) -> dict:
    consultation_ids: list[uuid.UUID] = []
    payment_ids: list[uuid.UUID] = []

    for client_data in data.clients:
        if not client_data.branch_id:
            raise HTTPException(
                status_code=400,
                detail="A branch is required for each client being onboarded",
            )
        branch = await db.get(Branch, client_data.branch_id)
        if branch is None:
            raise HTTPException(status_code=400, detail="Branch not found")
        if (
            user.company_id is not None
            and branch.company_id != user.company_id
        ):
            raise HTTPException(
                status_code=400,
                detail="Branch does not belong to the user's company",
            )

        consultation = Consultation(
            phone=client_data.phone,
            first_name=client_data.first_name,
            middle_name=client_data.middle_name,
            last_name=client_data.last_name,
            location=client_data.location,
            branch_id=client_data.branch_id,
            document_date=client_data.document_date or date.today(),
            created_by_phone=user.phone,
            status=ConsultationStatus.CONVERTED_COMPLETED,
        )
        db.add(consultation)
        await db.flush()
        consultation_ids.append(consultation.id)

        for pkg_data in client_data.packages:
            package = None
            if pkg_data.package_id:
                package = await db.get(Package, pkg_data.package_id)

            total_paid = sum(inst.amount for inst in pkg_data.installments)
            package_price = Decimal(str(package.price)) if package else total_paid

            discount_amount = Decimal("0")
            if pkg_data.discount_id:
                discount = await db.get(Discount, pkg_data.discount_id)
                if discount is None:
                    raise HTTPException(status_code=400, detail="Discount not found")
                if discount.company_id != branch.company_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Discount does not belong to the company",
                    )
                if discount.status not in (DiscountStatus.APPROVED, DiscountStatus.PENDING):
                    raise HTTPException(
                        status_code=400,
                        detail="Discount must be approved or pending to be applied",
                    )
                if not discount.is_active:
                    raise HTTPException(status_code=400, detail="Discount is not active")
                today = date.today()
                if discount.start_date > today:
                    raise HTTPException(status_code=400, detail="Discount has not started yet")
                if discount.end_date is not None and discount.end_date < today:
                    raise HTTPException(status_code=400, detail="Discount has expired")
                if discount.max_uses is not None and discount.used_count >= discount.max_uses:
                    raise HTTPException(status_code=400, detail="Discount usage limit reached")

                if discount.applies_to == DiscountAppliesTo.PRODUCT:
                    applies = str(pkg_data.product_id) in (discount.product_ids or [])
                elif discount.applies_to == DiscountAppliesTo.PACKAGE:
                    applies = bool(discount.package_ids) and str(pkg_data.package_id) in (
                        discount.package_ids or []
                    )
                else:
                    applies = True
                if not applies:
                    raise HTTPException(
                        status_code=400,
                        detail="Discount does not apply to this product/package",
                    )

                discount_amount = Decimal(str(compute_discount_amount(discount, float(package_price))))
                discount.used_count += 1

            effective_price = _effective_price(package_price, discount_amount)
            balance = max(Decimal("0"), effective_price - total_paid)
            is_fully_paid = balance == 0

            cart_item = CartItem(
                consultation_id=consultation.id,
                product_id=pkg_data.product_id,
                package_id=pkg_data.package_id,
                status=CartItemStatus.CONVERTED_PAID if is_fully_paid else CartItemStatus.CONVERTED_PAYING,
                converter_id=client_data.converter_id,
                primary_recommender_id=client_data.primary_recommender_id,
                secondary_recommender_id=client_data.secondary_recommender_id,
            )
            if package:
                cart_item.requires_driving_training = package.requires_driving_training
                cart_item.requires_theory_training = package.requires_theory_training
                cart_item.requires_permit_processing = package.requires_permit_processing
                cart_item.driving_training_duration_days = package.driving_training_duration_days
                cart_item.theory_training_hours = package.theory_training_hours
                cart_item.permit_processing_duration_days = package.permit_processing_duration_days
            db.add(cart_item)
            await db.flush()

            if pkg_data.discount_id:
                db.add(
                    CartItemDiscount(
                        cart_item_id=cart_item.id,
                        discount_id=pkg_data.discount_id,
                        applied_amount=float(discount_amount),
                        applied_by=user.phone,
                    )
                )
                await db.flush()

            await create_commission_from_conversion(
                db,
                cart_item,
                company_id=branch.company_id,
                converter_id=client_data.converter_id,
                recommender_id=client_data.primary_recommender_id,
                secondary_recommender_id=client_data.secondary_recommender_id,
            )

            for inst_data in pkg_data.installments:
                payment = Payment(
                    consultation_id=consultation.id,
                    branch_id=consultation.branch_id,
                    created_by_phone=inst_data.received_by_phone,
                    product_id=pkg_data.product_id,
                    package_id=pkg_data.package_id,
                    total_amount=effective_price,
                    total_paid=inst_data.amount,
                    balance=effective_price - inst_data.amount,
                    document_date=inst_data.document_date,
                    receipt_number=inst_data.receipt_number,
                    system_receipt_number=_generate_system_receipt_number(),
                    transaction_id=await generate_transaction_id(db),
                )
                db.add(payment)
                await db.flush()
                payment_ids.append(payment.id)

                installment = Installment(
                    payment_id=payment.id,
                    due_date=inst_data.document_date,
                    amount=inst_data.amount,
                    status=InstallmentStatus.PAID,
                    paid_date=inst_data.document_date,
                    paid_amount=inst_data.amount,
                    receipt_number=inst_data.receipt_number,
                )
                db.add(installment)

            if pkg_data.lessons:
                lessons_expanded = _expand_lessons(pkg_data.lessons)

                transmission = TransmissionType.MANUAL
                if pkg_data.transmission_type:
                    transmission = TransmissionType(pkg_data.transmission_type)

                template_items: dict[uuid.UUID, LessonTemplateItem] = {}
                if pkg_data.lesson_plan_template_id:
                    result = await db.execute(
                        select(LessonTemplateItem).where(
                            LessonTemplateItem.template_id == pkg_data.lesson_plan_template_id
                        )
                    )
                    template_items = {
                        item.id: item for item in result.scalars().all()
                    }

                plan = ClientLessonPlan(
                    cart_item_id=cart_item.id,
                    template_id=pkg_data.lesson_plan_template_id,
                    transmission_type=transmission,
                    start_date=datetime.combine(pkg_data.lessons[0].date, time.min),
                    status=LessonPlanStatus.ACTIVE,
                    purchased_days=len(lessons_expanded),
                    auto_generated=False,
                )
                db.add(plan)
                await db.flush()

                for idx, lesson_info in enumerate(lessons_expanded):
                    original = lesson_info["original"]
                    template_item = template_items.get(original.get("template_item_id"))
                    title = original.get("title") or (template_item.title if template_item else f"Lesson {idx + 1}")
                    lesson_objectives = original.get("lesson_objectives") or (
                        template_item.lesson_objectives if template_item else []
                    )
                    practical_objectives = original.get("practical_objectives") or (
                        template_item.practical_objectives if template_item else []
                    )
                    client_lesson = ClientLesson(
                        lesson_plan_id=plan.id,
                        template_item_id=original.get("template_item_id"),
                        day_number=idx + 1,
                        week_number=(idx // 5) + 1,
                        title=title,
                        lesson_objectives=lesson_objectives,
                        practical_objectives=practical_objectives,
                        order=idx,
                        status=_lesson_state(original.get("status")),
                        scheduled_date=original["date"],
                        duration_minutes=lesson_info["duration"],
                        instructor_id=original.get("instructor_id"),
                        vehicle_id=original.get("vehicle_id"),
                        is_theory=(original["lesson_type"] == "theory"),
                        completed_at=_lesson_completed_at(original.get("status"), original["date"]),
                        notes=original.get("notes"),
                    )
                    db.add(client_lesson)

                for original in pkg_data.lessons:
                    is_scheduled = original.status in ("scheduled", "pending")
                    session = TrainingSession(
                        cart_item_id=cart_item.id,
                        session_date=datetime.combine(original.date, time.min),
                        duration_minutes=original.duration_minutes,
                        driving_minutes=original.duration_minutes if original.lesson_type == "practical" else 0,
                        theory_minutes=original.duration_minutes if original.lesson_type == "theory" else 0,
                        started_at=None if is_scheduled else datetime.combine(original.date, time.min),
                    )
                    db.add(session)

            from app.services.cart import _update_consultation_status
            await _update_consultation_status(db, consultation.id)

    return {
        "created": len(consultation_ids),
        "consultation_ids": consultation_ids,
        "payment_ids": payment_ids,
    }


def _expand_lessons(lessons) -> list[dict]:
    expanded = []
    for lesson in lessons:
        if lesson.lesson_type == "theory":
            expanded.append({
                "duration": lesson.duration_minutes,
                "original": {
                    "date": lesson.date,
                    "duration_minutes": lesson.duration_minutes,
                    "lesson_type": lesson.lesson_type,
                    "instructor_id": lesson.instructor_id,
                    "vehicle_id": lesson.vehicle_id,
                    "notes": lesson.notes,
                    "template_item_id": lesson.template_item_id,
                    "title": lesson.title,
                    "lesson_objectives": lesson.lesson_objectives,
                    "practical_objectives": lesson.practical_objectives,
                    "status": lesson.status,
                },
            })
            continue
        chunks = math.ceil(lesson.duration_minutes / 30)
        for chunk_idx in range(chunks):
            remaining = lesson.duration_minutes - chunk_idx * 30
            chunk_duration = min(30, remaining)
            expanded.append({
                "duration": chunk_duration,
                "original": {
                    "date": lesson.date,
                    "duration_minutes": lesson.duration_minutes,
                    "lesson_type": lesson.lesson_type,
                    "instructor_id": lesson.instructor_id,
                    "vehicle_id": lesson.vehicle_id,
                    "notes": lesson.notes,
                    "template_item_id": lesson.template_item_id,
                    "title": lesson.title,
                    "lesson_objectives": lesson.lesson_objectives,
                    "practical_objectives": lesson.practical_objectives,
                    "status": lesson.status,
                },
            })
    return expanded


def _lesson_state(status: str | None) -> LessonState:
    if status in ("scheduled", "pending"):
        return LessonState.SCHEDULED
    return LessonState.COMPLETED


def _lesson_completed_at(status: str | None, lesson_date: date) -> datetime | None:
    if status in ("scheduled", "pending"):
        return None
    return datetime.combine(lesson_date, time.min)


def _expand_lessons_for_count(lessons) -> int:
    return len(_expand_lessons(lessons))
