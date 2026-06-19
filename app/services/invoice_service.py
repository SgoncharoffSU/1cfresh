import logging
import os
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus, RecurringSchedule
from app.schemas.invoice import InvoiceCreate, InvoiceItemCreate, InvoiceUpdate
from app.services.diadoc import diadoc_service
from app.services.email_service import send_invoice_email
from app.services.onec import onec_service

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------- CRUD


async def create_invoice(db: AsyncSession, data: InvoiceCreate) -> Invoice:
    invoice = Invoice(
        number=data.number,
        date=data.date or datetime.utcnow(),
        client_name=data.client_name,
        client_inn=data.client_inn,
        client_email=str(data.client_email),
        client_diadoc_id=data.client_diadoc_id,
        amount=data.amount,
        vat_rate=data.vat_rate,
        status=InvoiceStatus.DRAFT,
    )
    db.add(invoice)
    await db.flush()

    for item_data in data.items:
        db.add(
            InvoiceItem(
                invoice_id=invoice.id,
                name=item_data.name,
                quantity=item_data.quantity,
                unit=item_data.unit,
                price=item_data.price,
                vat_rate=item_data.vat_rate,
            )
        )

    await db.commit()
    await db.refresh(invoice)
    return await _load_invoice(db, invoice.id)  # reload with items


async def get_invoice(db: AsyncSession, invoice_id: int) -> Optional[Invoice]:
    return await _load_invoice(db, invoice_id)


async def get_invoices(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[Invoice]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.items))
        .order_by(Invoice.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def update_invoice(db: AsyncSession, invoice_id: int, data: InvoiceUpdate) -> Optional[Invoice]:
    invoice = await _load_invoice(db, invoice_id)
    if not invoice:
        return None
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(invoice, field, value)
    invoice.updated_at = datetime.utcnow()
    await db.commit()
    return await _load_invoice(db, invoice_id)


async def delete_invoice(db: AsyncSession, invoice_id: int) -> bool:
    invoice = await _load_invoice(db, invoice_id)
    if not invoice:
        return False
    await db.delete(invoice)
    await db.commit()
    return True


# --------------------------------------------------------------- full cycle


async def process_invoice_full_cycle(db: AsyncSession, invoice_id: int) -> Invoice:
    """
    1. POST to 1C → get GUID
    2. GET PDF from 1C → save to disk
    3. Send email with PDF attachment
    4. Send via Diadoc EDO (if INN or box_id available)
    """
    invoice = await _load_invoice(db, invoice_id)
    if not invoice:
        raise ValueError(f"Invoice {invoice_id} not found")

    schema = _invoice_to_schema(invoice)

    # Step 1 — 1C create
    try:
        guid = await onec_service.create_invoice(schema)
        invoice.onec_guid = guid
        invoice.status = InvoiceStatus.SENT_TO_1C
        await db.commit()
    except Exception as exc:
        await _fail(db, invoice, f"1C create error: {exc}")
        raise

    # Step 2 — fetch PDF
    pdf_bytes: bytes
    try:
        pdf_bytes = await onec_service.get_invoice_pdf(guid)
        pdf_path = os.path.join(
            settings.PDF_STORAGE_PATH,
            f"invoice_{invoice.number.replace('/', '_')}.pdf",
        )
        os.makedirs(settings.PDF_STORAGE_PATH, exist_ok=True)
        with open(pdf_path, "wb") as fh:
            fh.write(pdf_bytes)
        invoice.pdf_path = pdf_path
        invoice.status = InvoiceStatus.PDF_RECEIVED
        await db.commit()
    except Exception as exc:
        await _fail(db, invoice, f"PDF fetch error: {exc}")
        raise

    # Step 3 — email (non-fatal)
    try:
        await send_invoice_email(
            to_email=invoice.client_email,
            client_name=invoice.client_name,
            invoice_number=invoice.number,
            amount=invoice.amount,
            pdf_bytes=pdf_bytes,
        )
        invoice.status = InvoiceStatus.EMAIL_SENT
        await db.commit()
    except Exception as exc:
        logger.warning("Email failed for invoice %s: %s", invoice_id, exc)

    # Step 4 — Diadoc (non-fatal)
    target = invoice.client_diadoc_id or invoice.client_inn
    if target:
        try:
            await diadoc_service.send_invoice(
                inn_or_box_id=target,
                pdf_bytes=pdf_bytes,
                number=invoice.number,
                date_str=invoice.date.strftime("%d.%m.%Y"),
                amount=invoice.amount,
            )
            invoice.status = InvoiceStatus.EDO_SENT
            await db.commit()
        except Exception as exc:
            logger.warning("Diadoc failed for invoice %s: %s", invoice_id, exc)

    invoice.status = InvoiceStatus.COMPLETED
    await db.commit()
    return await _load_invoice(db, invoice_id)


# ----------------------------------------------------------------- helpers


async def _load_invoice(db: AsyncSession, invoice_id: int) -> Optional[Invoice]:
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.items)).where(Invoice.id == invoice_id)
    )
    return result.scalar_one_or_none()


async def _fail(db: AsyncSession, invoice: Invoice, msg: str) -> None:
    invoice.status = InvoiceStatus.FAILED
    invoice.error_message = msg
    await db.commit()


def _invoice_to_schema(invoice: Invoice) -> InvoiceCreate:
    return InvoiceCreate(
        number=invoice.number,
        date=invoice.date,
        client_name=invoice.client_name,
        client_inn=invoice.client_inn,
        client_email=invoice.client_email,
        client_diadoc_id=invoice.client_diadoc_id,
        amount=invoice.amount,
        vat_rate=invoice.vat_rate,
        items=[
            InvoiceItemCreate(
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                price=item.price,
                vat_rate=item.vat_rate,
            )
            for item in invoice.items
        ],
    )
