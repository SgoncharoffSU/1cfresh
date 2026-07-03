import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.api.deps import get_client_tenant
from app.models.tenant import OneCDocument
from app.models.schedule import DocumentSchedule
from app.schemas.document import (
    CounterpartyOut, DocumentItemOut, DocumentOut, SyncResult, DOC_TAB_NAMES,
)

_MOSCOW = timezone(timedelta(hours=3))

ONEC_ENTITY_MAP = {
    "INVOICE":  "Document_СчетНаОплатуПокупателю",
    "SALE":     "Document_РеализацияТоваровУслуг",
    "FACTURA":  "Document_СчетФактураВыданный",
    "CONTRACT": "Catalog_ДоговорыКонтрагентов",
}


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)

router = APIRouter(prefix="/documents", tags=["documents"])


def _parse_items(items_json: str | None) -> list[DocumentItemOut]:
    if not items_json:
        return []
    try:
        raw = json.loads(items_json)
        return [
            DocumentItemOut(
                line_number=str(item.get("LineNumber", "")),
                description=str(item.get("Содержание", "")),
                quantity=float(item.get("Количество", 0) or 0),
                price=float(item.get("Цена", 0) or 0),
                amount=float(item.get("Сумма", 0) or 0),
                vat_rate=str(item.get("СтавкаНДС", "")),
                vat_amount=float(item.get("СуммаНДС", 0) or 0),
            )
            for item in raw
            if isinstance(item, dict)
        ]
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def _to_out(doc: OneCDocument, sent_via: Optional[str] = None) -> DocumentOut:
    is_posted = bool(doc.is_posted)
    doc_type = doc.doc_type or "INVOICE"
    if sent_via:
        status = "SENT"
    elif is_posted:
        status = "SENT"
    else:
        status = "DRAFT"
    return DocumentOut(
        id=doc.ref_key,
        type=doc_type,
        tab_name=DOC_TAB_NAMES.get(doc_type, doc_type),
        number=doc.number or "",
        date=doc.date,
        amount=float(doc.amount or 0),
        status=status,
        is_posted=is_posted,
        deletion_mark=bool(doc.deletion_mark),
        sent_via=sent_via,
        counterparty=CounterpartyOut(
            id=doc.counterparty_key or "",
            name=doc.counterparty_name or doc.counterparty_key or "",
            inn=doc.counterparty_inn or "",
        ),
        synced_at=doc.synced_at,
        items=_parse_items(doc.items_json),
        comment=doc.comment or "",
    )


@router.get("/tabs")
async def list_tabs():
    """Возвращает список закладок (типов документов) с названиями."""
    return [{"type": k, "label": v} for k, v in DOC_TAB_NAMES.items()]


@router.get("/", response_model=List[DocumentOut])
async def list_documents(
    tenant_id: int = Depends(get_client_tenant),
    days: int = Query(90, ge=1, le=365),
    doc_type: Optional[str] = Query(None, description="INVOICE | SALE | FACTURA | CONTRACT"),
    db: AsyncSession = Depends(get_db),
):
    """Return cached 1C documents for a tenant, optionally filtered by tab (doc_type)."""
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = (
        select(OneCDocument)
        .where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.date >= cutoff,
        )
    )
    if doc_type:
        q = q.where(OneCDocument.doc_type == doc_type.upper())
    else:
        # Contracts have their own /contracts/ endpoint; exclude from general list
        q = q.where(OneCDocument.doc_type != "CONTRACT")
    q = q.order_by(OneCDocument.date.desc())
    result = await db.execute(q)
    docs = result.scalars().all()

    sent_by_ref: dict[str, str] = {}
    if docs:
        ref_keys = [d.ref_key for d in docs]
        sched_result = await db.execute(
            select(DocumentSchedule.document_ref_key, DocumentSchedule.delivery_channel)
            .where(
                DocumentSchedule.tenant_id == tenant_id,
                DocumentSchedule.document_ref_key.in_(ref_keys),
                DocumentSchedule.last_delivery_ok == True,  # noqa: E712
            )
        )
        for row in sched_result.all():
            if row.document_ref_key not in sent_by_ref and row.delivery_channel:
                sent_by_ref[row.document_ref_key] = row.delivery_channel

    return [_to_out(d, sent_by_ref.get(d.ref_key)) for d in docs]


@router.get("/counterparties", response_model=List[CounterpartyOut])
async def list_counterparties(
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            OneCDocument.counterparty_key,
            OneCDocument.counterparty_name,
            OneCDocument.counterparty_inn,
        )
        .where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.counterparty_key.isnot(None),
            OneCDocument.counterparty_key != "",
        )
        .group_by(
            OneCDocument.counterparty_key,
            OneCDocument.counterparty_name,
            OneCDocument.counterparty_inn,
        )
    )
    rows = result.all()
    return [
        CounterpartyOut(
            id=row.counterparty_key,
            name=row.counterparty_name or row.counterparty_key,
            inn=row.counterparty_inn or "",
        )
        for row in rows
    ]


@router.post("/sync", response_model=SyncResult)
async def trigger_sync(
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.tasks.sync_tasks import sync_one_tenant
    result = sync_one_tenant.delay(tenant_id)
    data = result.get(timeout=30)
    return SyncResult(
        tenant_id=tenant_id,
        invoices=data.get("invoices", 0),
        sales=data.get("sales", 0),
        facturas=data.get("facturas", 0),
        contracts=data.get("contracts", 0),
        synced_at=datetime.utcnow(),
    )


class BasedOnPayload(BaseModel):
    tenant_id:    int = 1
    based_on_type: str              # FACTURA | SALE
    is_posted:    bool = False


class BasedOnResult(BaseModel):
    ok:        bool
    guid:      Optional[str] = None
    number:    Optional[str] = None
    print_url: Optional[str] = None
    error:     Optional[str] = None


@router.post("/{doc_ref_key}/create-based-on", response_model=BasedOnResult)
async def create_based_on(
    doc_ref_key: str,
    payload: BasedOnPayload,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Создать документ на основании (счёт-фактура или реализация) из счёта на оплату."""
    result = await db.execute(
        select(OneCDocument).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.ref_key   == doc_ref_key,
        )
    )
    source_doc = result.scalar_one_or_none()
    if not source_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from sqlalchemy import select as sa_select
    from app.models.tenant import Tenant
    tenant_result = await db.execute(
        sa_select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from app.services.onec_odata import OneCODataClient
    client = OneCODataClient(
        login=tenant.odata_login,
        password=tenant.odata_password,
        base_url=tenant.odata_url,
    )

    based_on = payload.based_on_type.upper()
    try:
        if based_on == "FACTURA":
            created = client.create_factura_from_invoice(doc_ref_key, is_posted=payload.is_posted)
            entity  = ONEC_ENTITY_MAP["FACTURA"]
        elif based_on == "SALE":
            created = client.create_sale_from_invoice(doc_ref_key, is_posted=payload.is_posted)
            entity  = ONEC_ENTITY_MAP["SALE"]
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported based_on_type: {based_on}")
    except Exception as exc:
        return BasedOnResult(ok=False, error=str(exc))

    new_guid   = created.get("Ref_Key") or created.get("ref_key")
    new_number = created.get("Number") or ""
    print_url  = client.get_print_form_url(new_guid, entity) if new_guid else None

    return BasedOnResult(
        ok=True,
        guid=new_guid,
        number=new_number,
        print_url=print_url,
    )


class SendNowPayload(BaseModel):
    tenant_id:        int = 1
    delivery_channel: str
    delivery_address: str
    message:          Optional[str] = None


@router.post("/{doc_ref_key}/send-now")
async def send_document_now(
    doc_ref_key: str,
    payload: SendNowPayload,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OneCDocument).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.ref_key   == doc_ref_key,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if payload.delivery_channel == "TG":
        from app.config import settings
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        if not bot_token:
            raise HTTPException(status_code=500, detail="Telegram bot not configured")

        api_external = getattr(settings, "API_EXTERNAL_URL", "http://159.194.225.55:8018")
        print_url = (
            f"{api_external}/api/v1/documents/{doc_ref_key}/print"
            f"?tenant_id={tenant_id}"
        )

        doc_date   = doc.date
        amount_str = f"{float(doc.amount or 0):,.2f}".replace(",", " ").replace(".", ",")
        lines: list[str] = []
        if payload.message:
            lines += [f"💬 {payload.message}", ""]
        lines += [
            f"📄 <b>Счёт на оплату №{doc.number}</b>",
            f"📅 от {doc_date.strftime('%d.%m.%Y') if doc_date else '—'}",
            f"👤 {doc.counterparty_name or '—'}",
            f"💰 Итого: <b>{amount_str} ₽</b>",
            "",
            f'🔗 <a href="{print_url}">Открыть печатную форму</a>',
        ]
        text = "\n".join(lines)

        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = http_requests.post(
            tg_url,
            json={"chat_id": payload.delivery_address, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        tg_data = resp.json()
        if not tg_data.get("ok"):
            raise HTTPException(
                status_code=502,
                detail=f"Telegram: {tg_data.get('description', 'Unknown error')}",
            )

        now = _now_moscow()
        send_record = DocumentSchedule(
            tenant_id         = tenant_id,
            document_ref_key  = doc_ref_key,
            document_number   = doc.number or "",
            counterparty_key  = doc.counterparty_key or "",
            counterparty_name = doc.counterparty_name or "",
            amount            = float(doc.amount or 0),
            schedule_type     = "manual",
            schedule_config   = "{}",
            description       = "Отправлено вручную",
            is_active         = False,
            is_posted         = bool(doc.is_posted),
            delivery_channel  = "TG",
            delivery_address  = payload.delivery_address,
            message           = payload.message,
            last_delivery_ok  = True,
            last_delivery_at  = now,
            run_count         = 1,
            error_count       = 0,
        )
        db.add(send_record)
        await db.commit()
        return {"ok": True, "channel": "TG"}

    raise HTTPException(status_code=400, detail=f"Channel {payload.delivery_channel!r} not supported yet")
