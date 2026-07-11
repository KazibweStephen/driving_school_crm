import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.company import Branch, UserBranchAssignment
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.company import BranchRead
from app.schemas.payment import PaymentListResponse, PaymentTotals, PaymentWithClient
from app.services import payment as payment_service

router = APIRouter(tags=["payments"])


async def _resolve_branch_ids(
    db: AsyncSession,
    current_user: User,
    requested_branch_ids: list[str] | None,
) -> list[uuid.UUID] | None:
    """Return resolved branch UUIDs or None (all).

    For non-super users: returns only branches within their company.
    """
    # Start with the base branch query scoped to the user's company
    base_query = select(Branch)
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        base_query = base_query.where(Branch.company_id == current_user.company_id)

    is_privileged = current_user.role in (
        UserRole.SUPER_USER, UserRole.OFFICE_ADMIN, UserRole.MANAGER, UserRole.BRANCH_SUPERVISOR,
    )

    if requested_branch_ids and is_privileged:
        # Verify requested branches belong to the user's company
        result = await db.execute(
            base_query.where(Branch.id.in_([uuid.UUID(b) for b in requested_branch_ids]))
        )
        resolved = [b.id for b in result.scalars().all()]
        if not resolved:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No branch access")
        return resolved

    # Non-privileged or no selection: use assigned branches (scoped to company)
    result = await db.execute(
        select(UserBranchAssignment.branch_id)
        .join(Branch, UserBranchAssignment.branch_id == Branch.id)
        .where(
            UserBranchAssignment.user_id == current_user.phone,
            Branch.company_id == current_user.company_id if current_user.company_id and current_user.role != UserRole.SUPER_USER else True,
        )
    )
    assigned = [row[0] for row in result.all()]
    if not assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No branch access")
    return assigned


@router.get("/api/v1/payments/accessible-branches/")
async def accessible_branches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BranchRead]:
    base_query = select(Branch)
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        base_query = base_query.where(Branch.company_id == current_user.company_id)

    is_privileged = current_user.role in (
        UserRole.SUPER_USER, UserRole.OFFICE_ADMIN, UserRole.MANAGER, UserRole.BRANCH_SUPERVISOR,
    )
    if is_privileged:
        branches = (await db.execute(base_query.order_by(Branch.name))).scalars().all()
    else:
        result = await db.execute(
            base_query.join(UserBranchAssignment).where(
                UserBranchAssignment.user_id == current_user.phone
            ).order_by(Branch.name)
        )
        branches = result.scalars().all()
    return [BranchRead.model_validate(b) for b in branches]


@router.get("/api/v1/payments/")
async def list_payments(
    search: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    client_type: str | None = Query("all", pattern="^(all|new|collection)$"),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentListResponse:
    resolved = await _resolve_branch_ids(db, current_user, branch_ids.split(",") if branch_ids else None)
    payments, total, total_amount_sum, total_paid_sum, total_balance_sum = await payment_service.list_payments(
        db, search=search, date_from=date_from, date_to=date_to,
        client_type=client_type, branch_ids=resolved, page=page, page_size=page_size,
    )

    # Resolve product names and client info
    payment_list: list[PaymentWithClient] = []
    for p in payments:
        client_name = " ".join(
            filter(None, [p.consultation.first_name, p.consultation.middle_name, p.consultation.last_name])
        ).strip() or "—"

        product_name = "Product"
        try:
            pid = uuid.UUID(p.product_id) if isinstance(p.product_id, str) else p.product_id
            prod_result = await db.execute(select(Product).where(Product.id == pid))
            product = prod_result.scalar_one_or_none()
            if product:
                product_name = product.name
        except (ValueError, AttributeError):
            pass

        payment_list.append(PaymentWithClient(
            id=p.id,
            consultation_id=p.consultation_id,
            product_id=p.product_id,
            product_name=product_name,
            package_id=p.package_id,
            client_name=client_name,
            client_phone=p.consultation.phone or "—",
            created_by_name=p.created_by_user.name if p.created_by_user else None,
            total_amount=p.total_amount,
            total_paid=p.total_paid,
            balance=p.balance,
            document_date=p.document_date,
            notes=p.notes,
            receipt_number=p.receipt_number,
            system_receipt_number=p.system_receipt_number,
            created_at=p.created_at,
            updated_at=p.updated_at,
        ))

    return PaymentListResponse(
        payments=payment_list,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
        totals=PaymentTotals(
            total_amount_sum=total_amount_sum,
            total_paid_sum=total_paid_sum,
            total_balance_sum=total_balance_sum,
        ),
    )


@router.get("/api/v1/payments/report", response_class=HTMLResponse)
async def payments_report(
    search: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    client_type: str | None = Query("all", pattern="^(all|new|collection)$"),
    branch_ids: str | None = Query(None, description="Comma-separated branch UUIDs"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> str:
    resolved = await _resolve_branch_ids(db, current_user, branch_ids.split(",") if branch_ids else None)
    payments, total, total_amount_sum, total_paid_sum, total_balance_sum = await payment_service.list_payments(
        db, search=search, date_from=date_from, date_to=date_to,
        client_type=client_type, branch_ids=resolved, page=1, page_size=10000,
    )

    def _fmt(val):
        n = int(float(val))
        return f"{n:,}"

    rows = ""
    for p in payments:
        client_name = " ".join(
            filter(None, [p.consultation.first_name, p.consultation.middle_name, p.consultation.last_name])
        ).strip() or "—"
        client_phone = p.consultation.phone or "—"
        receipt = p.receipt_number or p.system_receipt_number
        doc_date = p.document_date.strftime("%Y-%m-%d") if p.document_date else (p.created_at.strftime("%Y-%m-%d") if p.created_at else "—")

        bal = p.balance
        status = "Paid" if bal <= 0 else ("Partial" if bal < p.total_amount else "Unpaid")

        rows += f"""<tr>
            <td>{client_name}<br><small>{client_phone}</small></td>
            <td>{receipt}</td>
            <td style="text-align:right">{_fmt(p.total_amount)}</td>
            <td style="text-align:right;color:#16a34a">{_fmt(p.total_paid)}</td>
            <td style="text-align:right;color:#dc2626">{_fmt(bal)}</td>
            <td style="text-align:center">{status}</td>
            <td>{doc_date}</td>
        </tr>"""

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payments Report</title>
<style>
  @page {{ margin: 15mm; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; color: #333; margin: 0; padding: 0; }}
  h1 {{ font-size: 20px; margin: 0 0 4px 0; }}
  .subtitle {{ font-size: 12px; color: #666; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #f3f4f6; text-align: left; padding: 8px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #d1d5db; }}
  td {{ padding: 7px 6px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }}
  .summary {{ display: flex; gap: 24px; margin-bottom: 16px; }}
  .summary-item {{ background: #f9fafb; padding: 10px 16px; border-radius: 6px; }}
  .summary-item .label {{ font-size: 11px; color: #6b7280; }}
  .summary-item .value {{ font-size: 18px; font-weight: 700; }}
  .footer {{ margin-top: 20px; font-size: 11px; color: #9ca3af; text-align: center; }}
  @media print {{ .no-print {{ display: none; }} }}
</style>
</head>
<body>
  <h1>Payments Report</h1>
  <div class="subtitle">Generated {now} — {total} payment(s)</div>

  <div class="summary">
    <div class="summary-item">
      <div class="label">Total Amount</div>
      <div class="value">{_fmt(total_amount_sum)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Paid</div>
      <div class="value" style="color:#16a34a">{_fmt(total_paid_sum)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Balance</div>
      <div class="value" style="color:#dc2626">{_fmt(total_balance_sum)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Client</th>
        <th>Receipt</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">Paid</th>
        <th style="text-align:right">Balance</th>
        <th style="text-align:center">Status</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>

  <div class="footer">Driving School CRM — Payments Report</div>
</body>
</html>"""
    return html


@router.get("/api/v1/payments/check-receipt/{receipt_number}")
async def check_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = await payment_service.get_payment_by_receipt(db, receipt_number)
    if payment is None:
        return {"exists": False}
    # Verify payment belongs to a consultation in the user's company
    if current_user.role != UserRole.SUPER_USER and current_user.company_id is not None:
        from sqlalchemy import select as sa_select
        from app.models.consultation import Consultation
        from app.models.company import Branch
        result = await db.execute(
            sa_select(Consultation.id)
            .join(Branch, Consultation.branch_id == Branch.id)
            .where(
                Consultation.id == payment.consultation_id,
                Branch.company_id == current_user.company_id,
            )
        )
        if result.scalar_one_or_none() is None:
            return {"exists": False}
    return {"exists": True}
