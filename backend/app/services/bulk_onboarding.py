import math
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
from app.schemas.bulk_onboarding import (
    BulkOnboardingCorrection,
    BulkOnboardingRequest,
)
from app.services.commission import create_commission_from_conversion
from app.services.discount import compute_discount_amount
from app.services.payment import (
    _generate_system_receipt_number,
    _recompute_payment_totals,
    cancel_payment,
    generate_transaction_id,
)


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


# ---------------------------------------------------------------------------
# Post-save corrections for onboarded clients
# ---------------------------------------------------------------------------

_CONVERTED_STATUSES = (
    ConsultationStatus.CONVERTED_NEW,
    ConsultationStatus.CONVERTED_UPSOLD,
    ConsultationStatus.CONVERTED_COMPLETED,
)

_ACTIVE_CART_STATUSES = (CartItemStatus.CONVERTED_PAID, CartItemStatus.CONVERTED_PAYING)


def _reject_future(d: date | None, label: str = "Date") -> None:
    if d is not None and d > date.today():
        raise HTTPException(status_code=400, detail=f"{label} cannot be in the future")


async def _get_consultation_scoped(
    db: AsyncSession, consultation_id: uuid.UUID, company_id: uuid.UUID | None
) -> Consultation:
    filters = [Consultation.id == consultation_id]
    if company_id is not None:
        filters.append(
            or_(
                Consultation.branch_id.is_(None),
                Branch.company_id == company_id,
            )
        )
    result = await db.execute(
        select(Consultation)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .where(*filters)
        .options(selectinload(Consultation.cart_items).selectinload(CartItem.discount_links))
    )
    consultation = result.scalar_one_or_none()
    if consultation is None:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return consultation


async def _cart_item_due(
    db: AsyncSession, cart_item: CartItem, payments: list[Payment]
) -> Decimal:
    """Effective due amount for a cart item: package price minus applied discount,
    falling back to the largest payment total_amount recorded."""
    total_due = Decimal("0")
    if cart_item.package_id:
        pkg = await db.get(Package, cart_item.package_id)
        if pkg is not None and pkg.price is not None:
            total_due = Decimal(str(pkg.price))
    discount_amount = Decimal("0")
    if cart_item.package_id is not None and cart_item.package_id:
        d_result = await db.execute(
            select(CartItemDiscount).where(CartItemDiscount.cart_item_id == cart_item.id)
        )
        for link in d_result.scalars().all():
            discount_amount += Decimal(str(link.applied_amount or 0))
    total_due = max(Decimal("0"), total_due - discount_amount)
    if total_due <= 0:
        total_due = max(
            (Decimal(str(p.total_amount)) for p in payments if p.cancelled_at is None),
            default=Decimal("0"),
        )
    return total_due


async def list_onboarded_clients(
    db: AsyncSession,
    user,
    branch_id: uuid.UUID,
    from_date: date | None,
    to_date: date | None,
    search: str | None,
    page: int,
    page_size: int,
) -> dict:
    branch = await db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=400, detail="Branch not found")
    if user.company_id is not None and branch.company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Branch not in your company")

    today = date.today()
    from_d = from_date or (today - timedelta(days=30))
    to_d = to_date or today
    if from_d > to_d:
        raise HTTPException(status_code=400, detail="from date must be before to date")

    filters = [
        Consultation.branch_id == branch.id,
        Consultation.document_date >= from_d,
        Consultation.document_date <= to_d,
        Consultation.status.in_(_CONVERTED_STATUSES),
    ]
    has_search = bool(search and search.strip())
    if has_search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                Consultation.phone.ilike(term),
                Consultation.first_name.ilike(term),
                Consultation.last_name.ilike(term),
            )
        )

    count_result = await db.execute(select(Consultation.id).where(*filters))
    total = len(list(count_result.scalars().all()))
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, page)
    offset = (page - 1) * page_size

    result = await db.execute(
        select(Consultation, Branch.name)
        .outerjoin(Branch, Consultation.branch_id == Branch.id)
        .where(*filters)
        .options(
            selectinload(Consultation.cart_items).selectinload(CartItem.discount_links),
        )
        .order_by(Consultation.document_date.desc(), Consultation.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = result.all()

    consultations = [row[0] for row in rows]
    consultation_ids = [c.id for c in consultations]
    cart_item_ids: list[uuid.UUID] = []
    for c in consultations:
        cart_item_ids.extend(ci.id for ci in c.cart_items)

    payments_map: dict[uuid.UUID, dict[str, list[Payment]]] = {cid: {} for cid in consultation_ids}
    if consultation_ids:
        p_result = await db.execute(
            select(Payment)
            .where(Payment.consultation_id.in_(consultation_ids))
            .options(selectinload(Payment.installments))
        )
        for p in p_result.scalars().all():
            key = f"{p.product_id}|{p.package_id or ''}"
            payments_map.setdefault(p.consultation_id, {}).setdefault(key, []).append(p)

    packages_map: dict[uuid.UUID, Package] = {}
    package_ids = list({ci.package_id for c in consultations for ci in c.cart_items if ci.package_id})
    if package_ids:
        pkg_result = await db.execute(select(Package).where(Package.id.in_(package_ids)))
        packages_map = {p.id: p for p in pkg_result.scalars().all()}

    plans_map: dict[uuid.UUID, list[ClientLessonPlan]] = {}
    if cart_item_ids:
        plan_result = await db.execute(
            select(ClientLessonPlan)
            .where(ClientLessonPlan.cart_item_id.in_(cart_item_ids))
            .options(selectinload(ClientLessonPlan.lessons))
        )
        for plan in plan_result.scalars().all():
            plans_map.setdefault(plan.cart_item_id, []).append(plan)

    clients = []
    for consultation, branch_name in rows:
        packages = []
        for cart_item in consultation.cart_items:
            if cart_item.status not in _ACTIVE_CART_STATUSES:
                continue
            key = f"{cart_item.product_id}|{cart_item.package_id or ''}"
            payments = payments_map.get(consultation.id, {}).get(key, [])
            pkg = packages_map.get(cart_item.package_id) if cart_item.package_id else None

            total_due = await _cart_item_due(db, cart_item, payments)
            total_paid = sum(
                (Decimal(str(p.total_paid)) for p in payments if p.cancelled_at is None),
                Decimal("0"),
            )
            balance = max(Decimal("0"), total_due - total_paid)

            discount_amount = Decimal("0")
            discount_id = None
            for link in cart_item.discount_links or []:
                discount_amount += Decimal(str(link.applied_amount or 0))
                discount_id = link.discount_id

            package_payments = []
            for p in sorted(payments, key=lambda x: x.document_date or x.created_at.date()):
                if p.cancelled_at is not None:
                    continue
                package_payments.append(
                    {
                        "id": p.id,
                        "document_date": p.document_date,
                        "receipt_number": p.receipt_number,
                        "amount": p.total_paid,
                        "balance": p.balance,
                        "received_by_phone": p.created_by_phone,
                        "cancelled_at": p.cancelled_at,
                    }
                )

            plan_read = None
            plans = plans_map.get(cart_item.id, [])
            if plans:
                plan = plans[0]
                plan_read = {
                    "id": plan.id,
                    "start_date": plan.start_date,
                    "transmission_type": plan.transmission_type.value
                    if plan.transmission_type
                    else None,
                    "template_id": plan.template_id,
                    "lessons": [
                        {
                            "id": l.id,
                            "day_number": l.day_number,
                            "title": l.title,
                            "scheduled_date": l.scheduled_date,
                            "duration_minutes": l.duration_minutes,
                            "lesson_type": "theory" if l.is_theory else "practical",
                            "status": l.status.value,
                            "instructor_id": l.instructor_id,
                            "vehicle_id": l.vehicle_id,
                            "notes": l.notes,
                        }
                        for l in sorted(plan.lessons, key=lambda x: x.day_number)
                    ],
                }

            packages.append(
                {
                    "cart_item_id": cart_item.id,
                    "product_id": str(cart_item.product_id),
                    "package_id": str(cart_item.package_id) if cart_item.package_id else None,
                    "status": cart_item.status.value,
                    "total_amount": total_due,
                    "total_paid": total_paid,
                    "balance": balance,
                    "discount_id": discount_id,
                    "discount_amount": discount_amount,
                    "converter_id": cart_item.converter_id,
                    "primary_recommender_id": cart_item.primary_recommender_id,
                    "secondary_recommender_id": cart_item.secondary_recommender_id,
                    "payments": package_payments,
                    "plan": plan_read,
                }
            )

        clients.append(
            {
                "id": consultation.id,
                "phone": consultation.phone,
                "first_name": consultation.first_name,
                "middle_name": consultation.middle_name,
                "last_name": consultation.last_name,
                "location": consultation.location,
                "branch_id": consultation.branch_id,
                "branch_name": branch_name,
                "document_date": consultation.document_date,
                "status": consultation.status.value,
                "packages": packages,
            }
        )

    return {
        "clients": clients,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


async def _find_cart_item(
    db: AsyncSession, consultation: Consultation, product_id: str | None, package_id: str | None
) -> CartItem:
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required for a new payment")
    result = await db.execute(
        select(CartItem)
        .where(
            CartItem.consultation_id == consultation.id,
            CartItem.product_id == product_id,
            (
                CartItem.package_id == package_id
                if package_id
                else CartItem.package_id.is_(None)
            ),
        )
        .options(selectinload(CartItem.discount_links))
    )
    cart_item = result.scalar_one_or_none()
    if cart_item is None:
        raise HTTPException(
            status_code=400, detail="No cart item for the given product/package on this consultation"
        )
    return cart_item


async def _receipt_collision(
    db: AsyncSession,
    consultation: Consultation,
    receipt_number: str | None,
    exclude_payment_id: uuid.UUID | None = None,
) -> None:
    if not receipt_number or len(receipt_number) < 2:
        return
    result = await db.execute(
        select(Payment).where(
            Payment.receipt_number == receipt_number,
            Payment.consultation_id != consultation.id,
        )
    )
    others = result.scalars().all()
    if any(o.id != exclude_payment_id for o in others):
        raise HTTPException(
            status_code=400,
            detail=f"Receipt number {receipt_number} is already used by another payment",
        )


async def _apply_discount_corrections(
    db: AsyncSession,
    consultation: Consultation,
    user,
    discounts_data,
) -> int:
    from app.services.discount import _discount_applies_to_cart_item, _get_cart_item_package_price, compute_discount_amount

    company_id = None
    if consultation.branch_id:
        branch = await db.get(Branch, consultation.branch_id)
        if branch is not None:
            company_id = branch.company_id
    if company_id is None:
        company_id = getattr(user, "company_id", None)

    changed = 0
    for disc in discounts_data:
        cart_item = await db.get(CartItem, disc.cart_item_id)
        if cart_item is None or cart_item.consultation_id != consultation.id:
            raise HTTPException(status_code=400, detail="Cart item not found for this consultation")

        link_result = await db.execute(
            select(CartItemDiscount)
            .where(CartItemDiscount.cart_item_id == cart_item.id)
            .options(selectinload(CartItemDiscount.discount))
        )
        existing = list(link_result.scalars().all())
        for link in existing:
            if link.discount and link.discount.used_count > 0:
                link.discount.used_count -= 1
            await db.delete(link)

        if disc.discount_id is not None:
            discount = await db.get(Discount, disc.discount_id)
            if discount is None:
                raise HTTPException(status_code=400, detail="Discount not found")
            if company_id is not None and discount.company_id != company_id:
                raise HTTPException(status_code=400, detail="Discount does not belong to this company")
            if discount.status not in (DiscountStatus.APPROVED, DiscountStatus.PENDING):
                raise HTTPException(status_code=400, detail="Discount must be approved or pending to be applied")
            if not discount.is_active:
                raise HTTPException(status_code=400, detail="Discount is not active")
            today = date.today()
            if discount.start_date > today:
                raise HTTPException(status_code=400, detail="Discount has not started yet")
            if discount.end_date is not None and discount.end_date < today:
                raise HTTPException(status_code=400, detail="Discount has expired")
            if discount.max_uses is not None and discount.used_count >= discount.max_uses:
                raise HTTPException(status_code=400, detail="Discount usage limit reached")
            if not await _discount_applies_to_cart_item(db, discount, cart_item):
                raise HTTPException(status_code=400, detail="Discount does not apply to this cart item")
            try:
                package_price = await _get_cart_item_package_price(db, cart_item)
            except ValueError:
                package_price = 0.0
            applied_amount = compute_discount_amount(discount, package_price)
            db.add(
                CartItemDiscount(
                    cart_item_id=cart_item.id,
                    discount_id=discount.id,
                    applied_amount=applied_amount,
                    applied_by=user.phone,
                )
            )
            discount.used_count += 1

        await _recompute_cart_item(db, consultation, cart_item)
        changed += 1
        await db.flush()

    return changed


async def _recompute_cart_item(
    db: AsyncSession, consultation: Consultation, cart_item: CartItem
) -> None:
    """Recompute a cart item's status from its payments (mirrors cancel_payment)."""
    all_payments_result = await db.execute(
        select(Payment)
        .where(
            Payment.consultation_id == consultation.id,
            Payment.product_id == cart_item.product_id,
            (
                Payment.package_id == cart_item.package_id
                if cart_item.package_id is not None
                else Payment.package_id.is_(None)
            ),
        )
        .options(selectinload(Payment.installments))
    )
    all_payments = list(all_payments_result.scalars().all())
    remaining_payments = [p for p in all_payments if p.cancelled_at is None]
    for p in all_payments:
        await _recompute_payment_totals(p)

    total_due = await _cart_item_due(db, cart_item, all_payments)
    total_paid = sum((p.total_paid for p in remaining_payments), Decimal("0"))

    if not remaining_payments or total_paid <= 0:
        new_status = CartItemStatus.CONSULTING
    elif total_paid >= total_due and total_due > 0:
        new_status = CartItemStatus.CONVERTED_PAID
    else:
        new_status = CartItemStatus.CONVERTED_PAYING
    cart_item.status = new_status
    await db.flush()


async def _apply_payment_edits(
    db: AsyncSession,
    consultation: Consultation,
    user,
    data: BulkOnboardingCorrection,
) -> dict:
    payments_updated = 0
    payments_created = 0
    affected_items: set[uuid.UUID] = set()

    for pay_data in data.payments:
        _reject_future(pay_data.document_date, "Payment date")
        if pay_data.id is not None:
            p_result = await db.execute(
                select(Payment)
                .where(Payment.id == pay_data.id)
                .options(selectinload(Payment.installments))
            )
            payment = p_result.scalar_one_or_none()
            if payment is None or payment.consultation_id != consultation.id:
                raise HTTPException(status_code=400, detail="Payment not found for this consultation")
            if payment.cancelled_at is not None:
                raise HTTPException(status_code=400, detail="Payment is cancelled")
            if (
                pay_data.receipt_number is not None
                and pay_data.receipt_number != payment.receipt_number
            ):
                await _receipt_collision(db, consultation, pay_data.receipt_number, exclude_payment_id=payment.id)

            if pay_data.document_date is not None:
                if consultation.document_date is not None and pay_data.document_date < consultation.document_date:
                    raise HTTPException(
                        status_code=400,
                        detail="Payment date cannot be before the consultation document date",
                    )
                payment.document_date = pay_data.document_date
                for inst in payment.installments:
                    if inst.status == InstallmentStatus.PAID:
                        inst.due_date = pay_data.document_date
                        inst.paid_date = pay_data.document_date
                        if pay_data.receipt_number:
                            inst.receipt_number = pay_data.receipt_number
            if pay_data.receipt_number is not None:
                payment.receipt_number = pay_data.receipt_number
            if pay_data.received_by_phone is not None:
                payment.created_by_phone = pay_data.received_by_phone
            if pay_data.amount is not None:
                paid_inst = [
                    i for i in payment.installments
                    if i.status == InstallmentStatus.PAID
                ]
                if not paid_inst:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot edit amount on a payment with no paid installment",
                    )
                amount = Decimal(str(pay_data.amount))
                for inst in paid_inst:
                    inst.amount = amount
                    inst.paid_amount = amount
                await _recompute_payment_totals(payment)
            await db.flush()
            payments_updated += 1
            edit_cart_item = await _find_cart_item(db, consultation, payment.product_id, payment.package_id)
            affected_items.add(edit_cart_item.id)
        else:
            cart_item = await _find_cart_item(db, consultation, pay_data.product_id, pay_data.package_id)
            effective_date = pay_data.document_date or consultation.document_date or date.today()
            if consultation.document_date is not None and effective_date < consultation.document_date:
                raise HTTPException(
                    status_code=400,
                    detail="Payment date cannot be before the consultation document date",
                )
            await _receipt_collision(db, consultation, pay_data.receipt_number)

            package = None
            package_price = Decimal("0")
            if cart_item.package_id:
                package = await db.get(Package, cart_item.package_id)
            if package is not None:
                package_price = Decimal(str(package.price))
            elif cart_item.package_id is None:
                package_price = pay_data.amount or Decimal("0")

            discount_amount = Decimal("0")
            for link in cart_item.discount_links or []:
                discount_amount += Decimal(str(link.applied_amount or 0))
            effective_price = _effective_price(package_price, discount_amount)
            if effective_price <= 0:
                effective_price = Decimal(str(pay_data.amount or 0))

            payment = Payment(
                consultation_id=consultation.id,
                branch_id=consultation.branch_id,
                created_by_phone=pay_data.received_by_phone or user.phone,
                product_id=cart_item.product_id,
                package_id=cart_item.package_id,
                total_amount=effective_price,
                total_paid=pay_data.amount or Decimal("0"),
                balance=max(Decimal("0"), effective_price - (pay_data.amount or Decimal("0"))),
                document_date=effective_date,
                receipt_number=pay_data.receipt_number,
                system_receipt_number=_generate_system_receipt_number(),
                transaction_id=await generate_transaction_id(db),
            )
            db.add(payment)
            await db.flush()
            db.add(
                Installment(
                    payment_id=payment.id,
                    due_date=effective_date,
                    amount=pay_data.amount or Decimal("0"),
                    status=InstallmentStatus.PAID,
                    paid_date=effective_date,
                    paid_amount=pay_data.amount or Decimal("0"),
                    receipt_number=pay_data.receipt_number,
                )
            )
            await db.flush()
            payments_created += 1
            affected_items.add(cart_item.id)

    for cart_item_id in affected_items:
        result = await db.execute(
            select(CartItem).where(CartItem.id == cart_item_id)
        )
        cart_item = result.scalar_one_or_none()
        if cart_item is not None:
            await _recompute_cart_item(db, consultation, cart_item)

    from app.services.cart import _update_consultation_status

    # Preload payments + installments so cancel_payment's internal re-computation
    # finds installments already loaded on identity-map objects.
    if data.remove_payment_ids:
        await db.execute(
            select(Payment)
            .where(Payment.consultation_id == consultation.id)
            .options(selectinload(Payment.installments))
        )

    payments_removed = 0
    for pid in data.remove_payment_ids:
        payment = await db.get(Payment, pid)
        if payment is None or payment.consultation_id != consultation.id:
            raise HTTPException(status_code=400, detail="Payment not found for this consultation")
        if payment.cancelled_at is not None:
            continue
        await cancel_payment(
            db,
            payment_id=pid,
            cancelled_by_phone=user.phone,
            reason="Removed via bulk onboarding correction",
        )
        payments_removed += 1

    if data.document_date is not None or data.payments or data.remove_payment_ids or data.discounts:
        await _update_consultation_status(db, consultation.id, allow_downgrade=True)
        await db.refresh(consultation)

    return {
        "payments_updated": payments_updated,
        "payments_created": payments_created,
        "payments_removed": payments_removed,
    }


async def _plan_for_consultation(
    db: AsyncSession, consultation: Consultation, plan_id: uuid.UUID
) -> ClientLessonPlan:
    cart_ids = [ci.id for ci in consultation.cart_items]
    result = await db.execute(
        select(ClientLessonPlan)
        .where(ClientLessonPlan.id == plan_id, ClientLessonPlan.cart_item_id.in_(cart_ids))
        .options(selectinload(ClientLessonPlan.lessons))
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=400, detail="Lesson plan not found for this consultation")
    return plan


async def _sync_training_session_date(
    db: AsyncSession, cart_item_id: uuid.UUID, old_date: date, new_date: date
) -> None:
    result = await db.execute(
        select(TrainingSession).where(TrainingSession.cart_item_id == cart_item_id)
    )
    sessions = list(result.scalars().all())
    candidate = None
    exact = [s for s in sessions if s.session_date and s.session_date.date() == old_date]
    if exact:
        candidate = exact[0]
    if candidate is None and sessions:
        candidate = sessions[0]
    if candidate is not None:
        candidate.session_date = datetime.combine(new_date, candidate.session_date.time())
        await db.flush()


async def _apply_lesson_edits(
    db: AsyncSession,
    plan: ClientLessonPlan,
    lessons,
) -> int:
    from app.services.lesson_plan import _recompute_plan_counters, update_client_lesson

    updated = 0
    for le in lessons:
        lesson = next((l for l in plan.lessons if l.id == le.id), None)
        if lesson is None:
            raise HTTPException(status_code=400, detail="Lesson not found in plan")
        if le.scheduled_date is not None and le.scheduled_date > date.today() and le.status == "completed":
            raise HTTPException(status_code=400, detail="Cannot mark a lesson as completed if its date is in the future")
        old_date = lesson.scheduled_date
        await update_client_lesson(
            db,
            lesson,
            status=le.status,
            scheduled_date=le.scheduled_date,
            duration_minutes=le.duration_minutes,
            instructor_id=le.instructor_id,
            vehicle_id=str(le.vehicle_id) if le.vehicle_id else None,
            notes=le.notes,
        )
        if le.scheduled_date is not None and old_date is not None and le.scheduled_date != old_date:
            await _sync_training_session_date(db, plan.cart_item_id, old_date, le.scheduled_date)
        updated += 1
    await _recompute_plan_counters(db, plan.id)
    await db.flush()
    return updated


async def _replace_plan_sessions(
    db: AsyncSession, cart_item_id: uuid.UUID, new_date: date, lessons
) -> None:
    result = await db.execute(
        select(TrainingSession).where(TrainingSession.cart_item_id == cart_item_id)
    )
    for old_session in result.scalars().all():
        await db.delete(old_session)
    await db.flush()
    for lesson in lessons:
        is_theory = getattr(lesson, "lesson_type", None) == "theory"
        lesson_date = getattr(lesson, "date", None)
        session_date = lesson_date or new_date
        duration = getattr(lesson, "duration_minutes", None) or (120 if is_theory else 30)
        db.add(
            TrainingSession(
                cart_item_id=cart_item_id,
                session_date=datetime.combine(session_date, time.min),
                duration_minutes=duration,
                driving_minutes=duration if not is_theory else 0,
                theory_minutes=duration if is_theory else 0,
                started_at=None,
            )
        )
    await db.flush()


async def apply_bulk_onboarding_corrections(
    db: AsyncSession,
    user,
    consultation_id: uuid.UUID,
    data: BulkOnboardingCorrection,
) -> dict:
    consultation = await _get_consultation_scoped(db, consultation_id, user.company_id)

    _reject_future(data.document_date, "Document date")

    fields_updated = 0
    for field in ("phone", "first_name", "middle_name", "last_name", "location"):
        value = getattr(data, field)
        if value is None:
            continue
        cleaned = value.strip()
        if field in ("middle_name", "last_name", "location"):
            setattr(consultation, field, cleaned or None)
        elif cleaned:
            setattr(consultation, field, cleaned)
        fields_updated += 1

    if data.document_date is not None:
        consultation.document_date = data.document_date

    discounts_updated = 0
    if data.discounts:
        discounts_updated = await _apply_discount_corrections(db, consultation, user, data.discounts)

    payment_result = await _apply_payment_edits(db, consultation, user, data)

    lessons_updated = 0
    plans_regenerated = 0

    for plan_data in data.plans:
        plan = await _plan_for_consultation(db, consultation, plan_data.plan_id)
        if plan_data.start_date is not None:
            plan.start_date = datetime.combine(plan_data.start_date, time.min)
        if plan_data.transmission_type is not None:
            plan.transmission_type = TransmissionType(plan_data.transmission_type)
        if plan_data.template_id is not None:
            plan.template_id = plan_data.template_id
        if plan_data.lessons:
            lessons_updated += await _apply_lesson_edits(db, plan, plan_data.lessons)
        await db.flush()

    for regen in data.regenerate_plans:
        from app.services.lesson_plan import replace_plan_lessons

        plan = await _plan_for_consultation(db, consultation, regen.plan_id)
        lessons_data = []
        for idx, lesson in enumerate(regen.lessons):
            if lesson.date is not None and lesson.date > date.today() and lesson.status == "completed":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot mark a lesson as completed if its date is in the future",
                )
            lessons_data.append({
                "day_number": idx + 1,
                "week_number": (idx // 5) + 1,
                "title": lesson.title or f"Lesson {idx + 1}",
                "lesson_objectives": lesson.lesson_objectives or [],
                "practical_objectives": lesson.practical_objectives or [],
                "scheduled_date": lesson.date,
                "duration_minutes": lesson.duration_minutes,
                "instructor_id": lesson.instructor_id,
                "vehicle_id": str(lesson.vehicle_id) if lesson.vehicle_id else None,
                "template_item_id": str(lesson.template_item_id) if lesson.template_item_id else None,
                "is_theory": lesson.lesson_type == "theory",
                "status": lesson.status,
            })
        new_date = regen.start_date or (
            plan.start_date.date() if plan.start_date else date.today()
        )
        await replace_plan_lessons(
            db,
            plan,
            lessons_data,
            start_date=datetime.combine(new_date, time.min) if regen.start_date else None,
            template_id=regen.template_id,
            transmission_type=regen.transmission_type,
        )
        await _replace_plan_sessions(db, plan.cart_item_id, new_date, regen.lessons)
        plans_regenerated += 1

    await db.commit()
    return {
        "consultation_id": consultation.id,
        "document_date": consultation.document_date,
        "fields_updated": fields_updated,
        "payments_updated": payment_result["payments_updated"],
        "payments_created": payment_result["payments_created"],
        "payments_removed": payment_result["payments_removed"],
        "discounts_updated": discounts_updated,
        "lessons_updated": lessons_updated,
        "plans_regenerated": plans_regenerated,
    }
