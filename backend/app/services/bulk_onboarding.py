import math
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartItem, CartItemStatus
from app.models.consultation import Consultation, ConsultationStatus
from app.models.lesson_plan import (
    ClientLesson,
    ClientLessonPlan,
    LessonPlanStatus,
    LessonState,
    TransmissionType,
)
from app.models.payment import Installment, InstallmentStatus, Payment
from app.models.product import Package
from app.models.training import TrainingSession
from app.schemas.bulk_onboarding import BulkOnboardingRequest
from app.services.payment import _generate_system_receipt_number


async def bulk_onboard_clients(
    db: AsyncSession,
    user,
    data: BulkOnboardingRequest,
) -> dict:
    consultation_ids: list[uuid.UUID] = []

    for client_data in data.clients:
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
            balance = max(Decimal("0"), package_price - total_paid)
            is_fully_paid = balance == 0

            cart_item = CartItem(
                consultation_id=consultation.id,
                product_id=pkg_data.product_id,
                package_id=pkg_data.package_id,
                status=CartItemStatus.CONVERTED_PAID if is_fully_paid else CartItemStatus.CONVERTED_PAYING,
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

            payment = Payment(
                consultation_id=consultation.id,
                created_by_phone=pkg_data.installments[0].received_by_phone if pkg_data.installments else user.phone,
                product_id=pkg_data.product_id,
                package_id=pkg_data.package_id,
                total_amount=package_price,
                total_paid=total_paid,
                balance=balance,
                document_date=pkg_data.installments[0].document_date if pkg_data.installments else client_data.document_date,
                receipt_number=pkg_data.installments[0].receipt_number if pkg_data.installments else None,
                system_receipt_number=_generate_system_receipt_number(),
            )
            db.add(payment)
            await db.flush()

            for inst_data in pkg_data.installments:
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

                plan = ClientLessonPlan(
                    cart_item_id=cart_item.id,
                    transmission_type=TransmissionType.MANUAL,
                    start_date=datetime.combine(pkg_data.lessons[0].date, time.min),
                    status=LessonPlanStatus.ACTIVE,
                    purchased_days=len(lessons_expanded),
                    auto_generated=False,
                )
                db.add(plan)
                await db.flush()

                for idx, lesson_info in enumerate(lessons_expanded):
                    original = lesson_info["original"]
                    client_lesson = ClientLesson(
                        lesson_plan_id=plan.id,
                        day_number=idx + 1,
                        week_number=(idx // 5) + 1,
                        title=f"Lesson {idx + 1}",
                        order=idx,
                        status=LessonState.COMPLETED,
                        scheduled_date=original["date"],
                        duration_minutes=lesson_info["duration"],
                        instructor_id=original.get("instructor_id"),
                        vehicle_id=original.get("vehicle_id"),
                        is_theory=(original["lesson_type"] == "theory"),
                        completed_at=datetime.combine(original["date"], time.min),
                        notes=original.get("notes"),
                    )
                    db.add(client_lesson)

                for original in pkg_data.lessons:
                    session = TrainingSession(
                        cart_item_id=cart_item.id,
                        session_date=datetime.combine(original.date, time.min),
                        duration_minutes=original.duration_minutes,
                        driving_minutes=original.duration_minutes if original.lesson_type == "practical" else 0,
                        theory_minutes=original.duration_minutes if original.lesson_type == "theory" else 0,
                    )
                    db.add(session)

            from app.services.cart import _update_consultation_status
            await _update_consultation_status(db, consultation.id)

    return {
        "created": len(consultation_ids),
        "consultation_ids": consultation_ids,
    }


def _expand_lessons(lessons) -> list[dict]:
    expanded = []
    for lesson in lessons:
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
                },
            })
    return expanded


def _expand_lessons_for_count(lessons) -> int:
    return len(_expand_lessons(lessons))
