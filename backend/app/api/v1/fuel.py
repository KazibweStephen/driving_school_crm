import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.fuel import (
    FuelRateCreate, FuelRateRead, FuelRateUpdate, FuelRateListResponse,
    FuelRefuelingCreate, FuelRefuelingRead, FuelRefuelingListResponse,
    FuelAlert,
)
from app.schemas.reports import FuelReportResponse, FuelReportItem
from app.services import fuel as fuel_service
from app.utils.tenant import resolve_company_id

router = APIRouter(prefix="/fuel", tags=["fuel"])


@router.get("/rates", response_model=list[FuelRateRead])
async def list_fuel_rates(
    vehicle_id: Optional[uuid.UUID] = Query(None),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = await fuel_service.list_fuel_rates(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        vehicle_id=vehicle_id,
        active_only=active_only,
    )
    return [
        FuelRateRead(
            id=r.id,
            company_id=r.company_id,
            vehicle_id=r.vehicle_id,
            rate_per_lesson=r.rate_per_lesson,
            is_active=r.is_active,
            effective_from=r.effective_from,
            notes=r.notes,
            created_at=r.created_at,
            updated_at=r.updated_at,
            vehicle_name=r.vehicle.name if r.vehicle else None,
            vehicle_plate=r.vehicle.plate_number if r.vehicle else None,
        )
        for r in items
    ]


@router.get("/rates/active", response_model=FuelRateRead)
async def get_active_rate(
    vehicle_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    rate = await fuel_service.get_active_fuel_rate_for_vehicle(
        db, vehicle_id, company_id
    )
    if not rate:
        raise HTTPException(status_code=404, detail="No active fuel rate for this vehicle")
    return FuelRateRead(
        id=rate.id,
        company_id=rate.company_id,
        vehicle_id=rate.vehicle_id,
        rate_per_lesson=rate.rate_per_lesson,
        is_active=rate.is_active,
        effective_from=rate.effective_from,
        notes=rate.notes,
        created_at=rate.created_at,
        updated_at=rate.updated_at,
        vehicle_name=rate.vehicle.name if rate.vehicle else None,
        vehicle_plate=rate.vehicle.plate_number if rate.vehicle else None,
    )


@router.post("/rates", response_model=FuelRateRead, status_code=status.HTTP_201_CREATED)
async def create_fuel_rate(
    data: FuelRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"create_fuel_rate data: vehicle_id={data.vehicle_id}, rate_per_lesson={data.rate_per_lesson}, effective_from={data.effective_from}, is_active={data.is_active}")
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    logger.info(f"create_fuel_rate company_id={company_id}")
    rate = await fuel_service.create_fuel_rate(
        db, company_id, data.model_dump()
    )
    return await fuel_service.get_fuel_rate_by_id(db, rate.id, company_id)


@router.patch("/rates/{rate_id}", response_model=FuelRateRead)
async def update_fuel_rate(
    rate_id: uuid.UUID,
    data: FuelRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await fuel_service.get_fuel_rate_by_id(db, rate_id, current_user.company_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Fuel rate not found")
    await fuel_service.update_fuel_rate(db, rate, data.model_dump(exclude_unset=True))
    return await fuel_service.get_fuel_rate_by_id(db, rate_id, current_user.company_id)


@router.delete("/rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fuel_rate(
    rate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate = await fuel_service.get_fuel_rate_by_id(db, rate_id, current_user.company_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Fuel rate not found")
    await fuel_service.delete_fuel_rate(db, rate)


@router.get("/refuelings", response_model=FuelRefuelingListResponse)
async def list_refuelings(
    vehicle_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await fuel_service.list_fuel_refuelings(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        vehicle_id=vehicle_id,
        page=page,
        page_size=page_size,
    )

    refueling_list = []
    for r in items:
        remaining = None
        if r.vehicle_id:
            status_data = await fuel_service.get_vehicle_fuel_status(
                db, r.vehicle_id, current_user.company_id
            )
            if status_data:
                remaining = status_data["remaining_lessons"]

        refueling_list.append(FuelRefuelingRead(
            id=r.id,
            company_id=r.company_id,
            vehicle_id=r.vehicle_id,
            fuel_rate_id=r.fuel_rate_id,
            amount=r.amount,
            liters=r.liters,
            lessons_covered=r.lessons_covered,
            refueled_at=r.refueled_at,
            odometer_reading=r.odometer_reading,
            notes=r.notes,
            created_at=r.created_at,
            vehicle_name=r.vehicle.name if r.vehicle else None,
            vehicle_plate=r.vehicle.plate_number if r.vehicle else None,
            rate_per_lesson=r.fuel_rate.rate_per_lesson if r.fuel_rate else None,
            remaining_lessons=remaining,
        ))

    return FuelRefuelingListResponse(
        items=refueling_list, total=total, page=page, page_size=page_size
    )


@router.post("/refuelings", response_model=FuelRefuelingRead, status_code=status.HTTP_201_CREATED)
async def create_refueling(
    data: FuelRefuelingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    refueling = await fuel_service.create_fuel_refueling(
        db, company_id, data.model_dump()
    )
    return await fuel_service.get_fuel_refueling_by_id(db, refueling.id, company_id)


@router.delete("/refuelings/{refueling_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_refueling(
    refueling_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    refueling = await fuel_service.get_fuel_refueling_by_id(
        db, refueling_id, current_user.company_id
    )
    if not refueling:
        raise HTTPException(status_code=404, detail="Refueling record not found")
    await fuel_service.delete_fuel_refueling(db, refueling)


@router.get("/alerts", response_model=list[FuelAlert])
async def get_fuel_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alerts = await fuel_service.get_fuel_alerts(
        db, current_user.company_id, current_user.role
    )
    return [FuelAlert(**a) for a in alerts]


@router.get("/status/{vehicle_id}")
async def get_vehicle_fuel_status(
    vehicle_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = await resolve_company_id(db, current_user)
    if not company_id:
        raise HTTPException(status_code=400, detail="No company configured")
    status_data = await fuel_service.get_vehicle_fuel_status(
        db, vehicle_id, company_id
    )
    if not status_data:
        raise HTTPException(status_code=404, detail="No fuel data for this vehicle")
    return status_data


@router.get("/report", response_model=FuelReportResponse)
async def fuel_report(
    vehicle_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await fuel_service.get_fuel_report(
        db,
        company_id=current_user.company_id,
        user_role=current_user.role,
        vehicle_id=vehicle_id,
        date_from=date_from,
        date_to=date_to,
    )
    items = [FuelReportItem(**item) for item in result["items"]]
    return FuelReportResponse(
        items=items,
        grand_total=result["grand_total"],
        grand_liters=result["grand_liters"],
        grand_lessons_covered=result["grand_lessons_covered"],
    )
