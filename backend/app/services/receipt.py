import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.consultation import Consultation
from app.models.payment import Payment, Installment
from app.models.product import Product

_CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131",
    "211412",
    "211214",
    "211232",
    "2331112",
]


def format_currency(amount: Decimal | float | int | None, currency: str = "UGX") -> str:
    """Format with currency prefix and no decimals."""
    if amount is None:
        amount = Decimal("0")
    return f"{currency} {Decimal(str(amount)):,.0f}"


def format_amount(amount: Decimal | float | int | None) -> str:
    """Format without currency prefix and no decimals."""
    if amount is None:
        amount = Decimal("0")
    return f"{Decimal(str(amount)):,.0f}"


def _code128_bars(text: str) -> list[int]:
    values = [104]
    for ch in text:
        code = ord(ch) - 32
        if code < 0 or code > 94:
            raise ValueError(f"Character {ch!r} not encodable in Code128B")
        values.append(code)
    checksum = values[0]
    for i in range(1, len(values)):
        checksum = (checksum + values[i] * i) % 103
    values.append(checksum)
    values.append(106)

    bars: list[int] = []
    for v in values:
        pattern_str = _CODE128_PATTERNS[v]
        for j, ch in enumerate(pattern_str):
            width = int(ch)
            bars.append(width if j % 2 == 0 else -width)
    return bars


def _generate_barcode_svg(text: str, height: int = 50) -> str:
    bars = _code128_bars(text)
    total_width = sum(abs(b) for b in bars)

    rects: list[str] = []
    x = 0
    for bar in bars:
        if bar > 0:
            rects.append(
                f'      <rect x="{x}" y="0" width="{bar}" height="{height}" fill="#000"/>'
            )
        x += abs(bar)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="{height}" '
        f'viewBox="0 0 {total_width} {height}" '
        'style="display:block;margin:0 auto;max-width:100%;">\n'
        + "\n".join(rects) +
        '\n    </svg>'
    )


async def generate_receipt_html(
    db: AsyncSession,
    payment_id: uuid.UUID,
    served_by_name: str | None = None,
    company_name: str | None = None,
) -> str:
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .options(
            selectinload(Payment.installments),
            selectinload(Payment.consultation).selectinload(Consultation.branch),
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    consultation = payment.consultation
    client_name = " ".join(
        filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
    ).strip() or "—"
    client_phone = consultation.phone or "—"

    branch_name = consultation.branch.name if consultation.branch else "—"
    served_by = served_by_name or "—"

    product_name = "Product"
    try:
        pid = uuid.UUID(payment.product_id) if isinstance(payment.product_id, str) else payment.product_id
        prod_result = await db.execute(select(Product).where(Product.id == pid))
        product = prod_result.scalar_one_or_none()
        if product:
            product_name = product.name
    except (ValueError, AttributeError):
        pass

    created_at: datetime | None = payment.created_at
    date_str = created_at.strftime("%Y-%m-%d %H:%M") if created_at else "—"

    # --- Cumulative product balance as of this payment ---
    # Load all payments for this product+package in the consultation,
    # sorted by creation time, to compute cumulative totals.
    from sqlalchemy import and_

    all_payments_result = await db.execute(
        select(Payment)
        .where(
            and_(
                Payment.consultation_id == payment.consultation_id,
                Payment.product_id == payment.product_id,
                Payment.package_id == payment.package_id,
            )
        )
        .options(selectinload(Payment.installments))
        .order_by(Payment.created_at.asc())
    )
    all_payments = list(all_payments_result.scalars().all())

    # Find the package price (grand total) from the earliest payment's total_amount
    grand_total = Decimal("0")
    if all_payments:
        grand_total = all_payments[0].total_amount

    # Sum total_paid for all payments up to and including this one
    cumulative_paid = Decimal("0")
    for p in all_payments:
        cumulative_paid += p.total_paid
        if p.id == payment.id:
            break

    remaining_balance = max(Decimal("0"), grand_total - cumulative_paid)

    total_amount = format_currency(grand_total)
    this_payment = format_currency(payment.total_paid)
    cumulative_paid_fmt = format_currency(cumulative_paid)
    balance_val = remaining_balance
    balance_fmt = format_currency(balance_val)

    # Manual receipt number
    receipt_number_html = ""
    if payment.receipt_number:
        receipt_number_html = (
            '<tr>\n'
            '                <td class="label">Receipt No:</td>\n'
            f'                <td class="value">{payment.receipt_number}</td>\n'
            '            </tr>'
        )

    # Installments table (merged by due_date)
    installments: list[Installment] = sorted(payment.installments, key=lambda x: x.due_date)
    installments_html = ""
    if installments:
        from collections import defaultdict
        merged: dict[str, dict] = defaultdict(lambda: {"amount": Decimal("0"), "paid": Decimal("0"), "all_paid": True})
        for inst in installments:
            key = inst.due_date.isoformat()
            merged[key]["amount"] += inst.amount
            if inst.paid_amount:
                merged[key]["paid"] += inst.paid_amount
            if inst.status.name != "PAID":
                merged[key]["all_paid"] = False
        rows = ""
        for date_key in sorted(merged.keys()):
            m = merged[date_key]
            status_label = "Paid" if m["all_paid"] else "Pending"
            paid = format_amount(m["paid"]) if m["paid"] > 0 else "—"
            rows += (
                f'<tr>\n'
                f'              <td>{date_key}</td>\n'
                f'              <td class="right">{format_amount(m["amount"])}</td>\n'
                f'              <td class="right">{paid}</td>\n'
                f'              <td class="right">{status_label}</td>\n'
                f'            </tr>'
            )
        installments_html = f"""
    <hr class="divider">
    <table class="installments-table">
        <thead>
            <tr>
                <th>Due Date</th>
                <th class="right">Amount</th>
                <th class="right">Paid</th>
                <th class="right">Status</th>
            </tr>
        </thead>
        <tbody>
            {rows}
        </tbody>
    </table>"""

    # Watermark
    watermark_html = ""
    if balance_val and balance_val > 0:
        watermark_html = (
            '<div class="watermark">'
            f'BALANCE: {format_currency(balance_val)}'
            '</div>'
        )
    else:
        watermark_html = '<div class="watermark">PAID</div>'

    # Barcode
    barcode_svg = _generate_barcode_svg(payment.system_receipt_number)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt {payment.system_receipt_number}</title>
<style>
    @page {{
        size: 80mm auto;
        margin: 0;
    }}
    * {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }}
    body {{
        font-family: 'Courier New', Courier, monospace;
        font-size: 10px;
        color: #000;
        background: #fff;
        width: 72mm;
        margin: 0 auto;
        padding: 3mm 0;
        line-height: 1.3;
    }}
    @media print {{
        body {{
            width: 72mm;
            padding: 2mm 0;
        }}
        .no-print {{
            display: none !important;
        }}
    }}
    @media screen {{
        body {{
            padding: 4mm;
            border: 1px dashed #ccc;
            margin: 12px auto;
            border-radius: 4px;
            box-shadow: 0 0 8px rgba(0,0,0,0.1);
        }}
    }}
    .header {{
        text-align: center;
        margin-bottom: 3mm;
    }}
    .header h1 {{
        font-size: 14px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
    }}
    .header p {{
        font-size: 10px;
        margin-top: 1mm;
        font-weight: bold;
    }}
    hr {{
        border: none;
        border-top: 1px dashed #000;
        margin: 2mm 0;
    }}
    .receipt-info table {{
        width: 100%;
        border-collapse: collapse;
    }}
    .receipt-info td {{
        padding: 1px 0;
        font-size: 10px;
    }}
    .receipt-info td.label {{
        width: 30%;
        opacity: 0.7;
    }}
    .receipt-info td.value {{
        width: 70%;
        font-weight: bold;
    }}
    .items-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 2mm 0;
    }}
    .items-table th {{
        text-align: left;
        font-size: 10px;
        border-bottom: 1px dashed #000;
        padding: 1mm 0 0.5mm 0;
    }}
    .items-table th.right {{
        text-align: right;
    }}
    .items-table td {{
        padding: 0.5mm 0;
        font-size: 10px;
        vertical-align: top;
    }}
    .items-table td.right {{
        text-align: right;
        white-space: nowrap;
    }}
    .item-block {{
        margin: 2mm 0;
        padding: 1mm 0;
    }}
    .item-row {{
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0.8mm 0;
        border-bottom: 1px dotted #ccc;
    }}
    .item-row:last-child {{
        border-bottom: none;
    }}
    .item-label {{
        font-size: 10px;
        opacity: 0.7;
        flex-shrink: 0;
        padding-right: 2mm;
    }}
    .item-value {{
        font-size: 10px;
        font-weight: bold;
        text-align: right;
        word-break: break-word;
    }}
    .totals-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 1mm 0;
    }}
    .totals-table td {{
        padding: 0.5mm 0;
        font-size: 10px;
    }}
    .totals-table td.right {{
        text-align: right;
        white-space: nowrap;
    }}
    .totals-table .total-row td {{
        font-weight: bold;
        font-size: 12px;
        border-top: 1px dashed #000;
        padding-top: 1mm;
    }}
    .installments-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 2mm 0;
    }}
    .installments-table th {{
        text-align: left;
        font-size: 9px;
        border-bottom: 1px dashed #000;
        padding: 0.5mm 0;
    }}
    .installments-table th.right {{
        text-align: right;
    }}
    .installments-table td {{
        padding: 0.3mm 0;
        font-size: 9px;
    }}
    .installments-table td.right {{
        text-align: right;
        white-space: nowrap;
    }}
    .barcode-section {{
        text-align: center;
        margin: 3mm 0;
    }}
    .barcode-number {{
        font-size: 9px;
        margin-top: 0.5mm;
        letter-spacing: 1px;
    }}
    .footer {{
        text-align: center;
        margin-top: 3mm;
        font-size: 10px;
    }}
    .watermark {{
        text-align: center;
        font-size: 22px;
        font-weight: bold;
        margin: 2mm 0;
        letter-spacing: 3px;
    }}
</style>
</head>
<body>

<div class="header">
    <h1>{company_name or settings.app_name}</h1>
    <p>OFFICIAL RECEIPT</p>
</div>

<hr>

<div class="receipt-info">
    <table>
        <tr>
            <td class="label">System No:</td>
            <td class="value">{payment.system_receipt_number}</td>
        </tr>
        {receipt_number_html}
        <tr>
            <td class="label">Date:</td>
            <td class="value">{date_str}</td>
        </tr>
        <tr>
            <td class="label">Branch:</td>
            <td class="value">{branch_name}</td>
        </tr>
        <tr>
            <td class="label">Served By:</td>
            <td class="value">{served_by}</td>
        </tr>
        <tr>
            <td class="label">Client:</td>
            <td class="value">{client_name}</td>
        </tr>
    </table>
</div>

<hr>

<!-- Item detail block: vertical rows for 80mm readability -->
<div class="item-block">
    <div class="item-row">
        <span class="item-label">Item:</span>
        <span class="item-value">{product_name}</span>
    </div>
    <div class="item-row">
        <span class="item-label">Grand Total:</span>
        <span class="item-value">{format_amount(grand_total)}</span>
    </div>
    <div class="item-row">
        <span class="item-label">This Pmt:</span>
        <span class="item-value">{format_amount(payment.total_paid)}</span>
    </div>
    <div class="item-row">
        <span class="item-label">Cum. Paid:</span>
        <span class="item-value">{format_amount(cumulative_paid)}</span>
    </div>
    <div class="item-row">
        <span class="item-label">Balance:</span>
        <span class="item-value">{format_amount(remaining_balance)}</span>
    </div>
</div>

<hr>

{watermark_html}

<table class="totals-table">
    <tr>
        <td>Grand Total:</td>
        <td class="right">{total_amount}</td>
    </tr>
    <tr>
        <td>This Payment:</td>
        <td class="right">{this_payment}</td>
    </tr>
    <tr>
        <td>Cumulative Paid:</td>
        <td class="right">{cumulative_paid_fmt}</td>
    </tr>
    <tr class="total-row">
        <td>Balance Due:</td>
        <td class="right">{balance_fmt}</td>
    </tr>
</table>

{installments_html}

<hr>

<div class="barcode-section">
    {barcode_svg}
    <div class="barcode-number">{payment.system_receipt_number}</div>
</div>

<hr>

<div class="footer">
    <p>Thank you for choosing {company_name or settings.app_name}!</p>
</div>

<div class="no-print" style="text-align:center;margin-top:6mm;">
    <button onclick="window.print()" style="padding:3mm 8mm;font-size:12px;cursor:pointer;">
        Print Receipt
    </button>
    <p style="margin-top:2mm;font-size:9px;opacity:0.6;">
        Receipt {payment.system_receipt_number}
    </p>
</div>

</body>
</html>"""

    return html


async def generate_consolidated_receipt_html(
    db: AsyncSession,
    receipt_number: str,
    consultation_id: uuid.UUID,
    served_by_name: str | None = None,
    company_name: str | None = None,
) -> str:
    """Generate a consolidated receipt for all payments sharing the same manual receipt_number."""
    from sqlalchemy import and_

    payments_result = await db.execute(
        select(Payment)
        .where(
            and_(
                Payment.receipt_number == receipt_number,
                Payment.consultation_id == consultation_id,
            )
        )
        .options(
            selectinload(Payment.consultation).selectinload(Consultation.branch),
        )
    )
    payments = list(payments_result.scalars().all())
    if not payments:
        raise HTTPException(status_code=404, detail="No payments found for this receipt number")

    consultation = payments[0].consultation
    client_name = " ".join(
        filter(None, [consultation.first_name, consultation.middle_name, consultation.last_name])
    ).strip() or "—"
    client_phone = consultation.phone or "—"

    branch_name = consultation.branch.name if consultation.branch else "—"
    served_by = served_by_name or "—"

    created_at: datetime | None = payments[0].created_at
    date_str = created_at.strftime("%Y-%m-%d %H:%M") if created_at else "—"

    # Resolve product names for all payments
    item_rows = ""
    grand_total = Decimal("0")
    total_paid_all = Decimal("0")
    total_balance = Decimal("0")
    all_installments: list[Installment] = []

    for payment in payments:
        product_name = "Product"
        try:
            pid = uuid.UUID(payment.product_id) if isinstance(payment.product_id, str) else payment.product_id
            prod_result = await db.execute(select(Product).where(Product.id == pid))
            product = prod_result.scalar_one_or_none()
            if product:
                product_name = product.name
        except (ValueError, AttributeError):
            pass

        # Load installments for this payment
        inst_result = await db.execute(
            select(Installment).where(Installment.payment_id == payment.id).order_by(Installment.due_date)
        )
        payment_installments = list(inst_result.scalars().all())
        all_installments.extend(payment_installments)

        grand_total += payment.total_amount
        total_paid_all += payment.total_paid
        total_balance += payment.balance

        package_label = ""
        if payment.package_id:
            from app.models.product import Package
            try:
                pkid = uuid.UUID(payment.package_id) if isinstance(payment.package_id, str) else payment.package_id
                pkg_result = await db.execute(select(Package).where(Package.id == pkid))
                pkg = pkg_result.scalar_one_or_none()
                if pkg:
                    package_label = f"({pkg.name})"
            except (ValueError, AttributeError):
                pass

        item_rows += f"""
    <div class="item-block">
        <div class="item-row">
            <span class="item-label">Item:</span>
            <span class="item-value">{product_name} {package_label}</span>
        </div>
        <div class="item-row">
            <span class="item-label">Grand Total:</span>
            <span class="item-value">{format_amount(payment.total_amount)}</span>
        </div>
        <div class="item-row">
            <span class="item-label">This Pmt:</span>
            <span class="item-value">{format_amount(payment.total_paid)}</span>
        </div>
        <div class="item-row">
            <span class="item-label">Balance:</span>
            <span class="item-value">{format_amount(payment.balance)}</span>
        </div>
    </div>
    <hr class="divider">"""

    watermark_html = ""
    if total_balance > 0:
        watermark_html = f'<div class="watermark">BALANCE: {format_currency(total_balance)}</div>'
    else:
        watermark_html = '<div class="watermark">PAID</div>'

    # Installments table (all payments' installments combined, merged by due_date)
    all_installments.sort(key=lambda x: x.due_date)
    installments_html = ""
    if all_installments:
        from collections import defaultdict
        merged: dict[str, dict] = defaultdict(lambda: {"amount": Decimal("0"), "paid": Decimal("0"), "all_paid": True})
        for inst in all_installments:
            key = inst.due_date.isoformat()
            merged[key]["amount"] += inst.amount
            if inst.paid_amount:
                merged[key]["paid"] += inst.paid_amount
            if inst.status.name != "PAID":
                merged[key]["all_paid"] = False
        rows = ""
        for date_key in sorted(merged.keys()):
            m = merged[date_key]
            status_label = "Paid" if m["all_paid"] else "Pending"
            paid = format_amount(m["paid"]) if m["paid"] > 0 else "—"
            rows += (
                f'<tr>\n'
                f'              <td>{date_key}</td>\n'
                f'              <td class="right">{format_amount(m["amount"])}</td>\n'
                f'              <td class="right">{paid}</td>\n'
                f'              <td class="right">{status_label}</td>\n'
                f'            </tr>'
            )
        installments_html = f"""
    <hr class="divider">
    <table class="installments-table">
        <thead>
            <tr>
                <th>Due Date</th>
                <th class="right">Amount</th>
                <th class="right">Paid</th>
                <th class="right">Status</th>
            </tr>
        </thead>
        <tbody>
            {rows}
        </tbody>
    </table>"""

    # Use the first payment's system receipt number as primary
    system_receipt_number = payments[0].system_receipt_number
    barcode_svg = _generate_barcode_svg(receipt_number)

    receipt_number_html = ""
    if receipt_number:
        receipt_number_html = (
            '<tr>\n'
            '                <td class="label">Receipt No:</td>\n'
            f'                <td class="value">{receipt_number}</td>\n'
            '            </tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt {receipt_number}</title>
<style>
    @page {{
        size: 80mm auto;
        margin: 0;
    }}
    * {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }}
    body {{
        font-family: 'Courier New', Courier, monospace;
        font-size: 10px;
        color: #000;
        background: #fff;
        width: 72mm;
        margin: 0 auto;
        padding: 3mm 0;
        line-height: 1.3;
    }}
    @media print {{
        body {{
            width: 72mm;
            padding: 2mm 0;
        }}
        .no-print {{
            display: none !important;
        }}
    }}
    @media screen {{
        body {{
            padding: 4mm;
            border: 1px dashed #ccc;
            margin: 12px auto;
            border-radius: 4px;
            box-shadow: 0 0 8px rgba(0,0,0,0.1);
        }}
    }}
    .header {{
        text-align: center;
        margin-bottom: 3mm;
    }}
    .header h1 {{
        font-size: 14px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
    }}
    .header p {{
        font-size: 10px;
        margin-top: 1mm;
        font-weight: bold;
    }}
    hr {{
        border: none;
        border-top: 1px dashed #000;
        margin: 2mm 0;
    }}
    hr.divider {{
        margin: 1mm 0;
        border-top: 1px dotted #ccc;
    }}
    .receipt-info table {{
        width: 100%;
        border-collapse: collapse;
    }}
    .receipt-info td {{
        padding: 1px 0;
        font-size: 10px;
    }}
    .receipt-info td.label {{
        width: 30%;
        opacity: 0.7;
    }}
    .receipt-info td.value {{
        width: 70%;
        font-weight: bold;
    }}
    .item-block {{
        margin: 1mm 0;
        padding: 0.5mm 0;
    }}
    .item-row {{
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0.8mm 0;
        border-bottom: 1px dotted #ccc;
    }}
    .item-row:last-child {{
        border-bottom: none;
    }}
    .item-label {{
        font-size: 10px;
        opacity: 0.7;
        flex-shrink: 0;
        padding-right: 2mm;
    }}
    .item-value {{
        font-size: 10px;
        font-weight: bold;
        text-align: right;
        word-break: break-word;
    }}
    .totals-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 1mm 0;
    }}
    .totals-table td {{
        padding: 0.5mm 0;
        font-size: 10px;
    }}
    .totals-table td.right {{
        text-align: right;
        white-space: nowrap;
    }}
    .totals-table .total-row td {{
        font-weight: bold;
        font-size: 12px;
        border-top: 1px dashed #000;
        padding-top: 1mm;
    }}
    .installments-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 2mm 0;
    }}
    .installments-table th {{
        text-align: left;
        font-size: 9px;
        border-bottom: 1px dashed #000;
        padding: 0.5mm 0;
    }}
    .installments-table th.right {{
        text-align: right;
    }}
    .installments-table td {{
        padding: 0.3mm 0;
        font-size: 9px;
    }}
    .installments-table td.right {{
        text-align: right;
        white-space: nowrap;
    }}
    .barcode-section {{
        text-align: center;
        margin: 3mm 0;
    }}
    .barcode-number {{
        font-size: 9px;
        margin-top: 0.5mm;
        letter-spacing: 1px;
    }}
    .footer {{
        text-align: center;
        margin-top: 3mm;
        font-size: 10px;
    }}
    .watermark {{
        text-align: center;
        font-size: 22px;
        font-weight: bold;
        margin: 2mm 0;
        letter-spacing: 3px;
    }}
</style>
</head>
<body>

<div class="header">
    <h1>{company_name or settings.app_name}</h1>
    <p>OFFICIAL RECEIPT</p>
</div>

<hr>

<div class="receipt-info">
    <table>
        {receipt_number_html}
        <tr>
            <td class="label">Date:</td>
            <td class="value">{date_str}</td>
        </tr>
        <tr>
            <td class="label">Branch:</td>
            <td class="value">{branch_name}</td>
        </tr>
        <tr>
            <td class="label">Served By:</td>
            <td class="value">{served_by}</td>
        </tr>
        <tr>
            <td class="label">Client:</td>
            <td class="value">{client_name}</td>
        </tr>
        <tr>
            <td class="label">Phone:</td>
            <td class="value">{client_phone}</td>
        </tr>
    </table>
</div>

<hr>

{item_rows}

{watermark_html}

<table class="totals-table">
    <tr>
        <td>Grand Total:</td>
        <td class="right">{format_currency(grand_total)}</td>
    </tr>
    <tr>
        <td>Total Paid:</td>
        <td class="right">{format_currency(total_paid_all)}</td>
    </tr>
    <tr class="total-row">
        <td>Balance Due:</td>
        <td class="right">{format_currency(total_balance)}</td>
    </tr>
</table>

{installments_html}

<hr>

<div class="barcode-section">
    {barcode_svg}
    <div class="barcode-number">{receipt_number}</div>
</div>

<hr>

<div class="footer">
    <p>Thank you for choosing {company_name or settings.app_name}!</p>
</div>

<div class="no-print" style="text-align:center;margin-top:6mm;">
    <button onclick="window.print()" style="padding:3mm 8mm;font-size:12px;cursor:pointer;">
        Print Receipt
    </button>
    <p style="margin-top:2mm;font-size:9px;opacity:0.6;">
        Receipt {receipt_number}
    </p>
</div>

</body>
</html>"""

    return html


async def get_receipt_download_url(payment_id: uuid.UUID) -> str:
    return f"{settings.receipt_base_url}/api/v1/receipts/{payment_id}/download"
