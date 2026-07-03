"""API для работы с договорами и расписаниями документов."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db.database import get_db
from app.api.deps import get_client_tenant
from app.models.contract_schedule import ContractSchedule
from app.models.tenant import OneCDocument, Tenant
from app.schemas.contract_schedule import (
    ContractOut, ContractScheduleCreate, ContractScheduleOut, ContractScheduleUpdate,
    ScheduleItem,
)
from app.services.contract_schedule_service import compute_contract_next_run

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contracts", tags=["contracts"])




# ── nomenclature catalog ────────────────────────────────────────────────────────

@router.get("/nomenclature")
async def list_nomenclature(
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Справочник номенклатуры для пикера.
    Источник 1 (основной): Catalog_Номенклатура напрямую из 1С.
    Источник 2 (дополнение): строки items_json из уже синхронизированных INVOICE/SALE.
    Результаты объединяются и дедублируются по Ref_Key / Номенклатура_Key.
    """
    import asyncio
    from app.services.onec_odata import OneCODataClient

    seen: dict[str, dict] = {}

    # ── Источник 1: Catalog_Номенклатура из 1С ─────────────────────────────────
    tr2 = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tr2.scalar_one_or_none()
    if tenant and tenant.odata_login and tenant.odata_url:
        def _fetch_catalog():
            client = OneCODataClient(
                login    = tenant.odata_login,
                password = tenant.odata_password,
                base_url = tenant.odata_url,
            )
            return client.get_nomenclature_catalog()

        try:
            catalog_items = await asyncio.get_running_loop().run_in_executor(None, _fetch_catalog)
            for it in catalog_items:
                ref = it.get("Ref_Key", "")
                name = (it.get("Description") or it.get("Наименование") or "").strip()
                if not ref or not name:
                    continue
                seen[ref] = {
                    "key":             ref,
                    "name":            name,
                    "price":           0.0,
                    "vat":             it.get("ВидСтавкиНДС", "") or "БезНДС",
                    "nomenclature_key": ref,
                    "periodicity":     it.get("ПериодичностьУслуги", "") or "",
                }
        except Exception as exc:
            logger.warning("Failed to fetch Catalog_Номенклатура: %s", exc)

    # ── Источник 2: из items_json синхронизированных документов ───────────────
    result = await db.execute(
        select(OneCDocument.items_json).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.items_json != None,    # noqa: E711
            OneCDocument.items_json != "[]",
            OneCDocument.doc_type.in_(["INVOICE", "SALE"]),
        )
    )

    # Индекс имя→ключ для слияния позиций каталога и документов
    name_to_key: dict[str, str] = {v["name"]: k for k, v in seen.items()}

    for (items_json,) in result.all():
        try:
            rows = json.loads(items_json)
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                name = (row.get("Содержание") or "").strip()
                if not name:
                    continue
                nom_key = row.get("Номенклатура_Key") or None
                price   = float(row.get("Цена", 0) or 0)
                vat     = row.get("СтавкаНДС", "БезНДС") or "БезНДС"

                # Ищем совпадение: сначала по nom_key, потом по имени
                match_key = nom_key if (nom_key and nom_key in seen) else name_to_key.get(name)

                if match_key:
                    # Обновляем цену/НДС (документ несёт актуальную цену)
                    if price > 0:
                        seen[match_key]["price"] = price
                    seen[match_key]["vat"] = vat
                else:
                    key = nom_key or name
                    seen[key] = {
                        "key":             key,
                        "name":            name,
                        "price":           price,
                        "vat":             vat,
                        "nomenclature_key": nom_key,
                    }
                    name_to_key[name] = key
        except Exception:
            continue

    return sorted(seen.values(), key=lambda x: x["name"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _schedule_out(s: ContractSchedule) -> ContractScheduleOut:
    fields = json.loads(s.custom_fields) if s.custom_fields else None
    items: list[ScheduleItem] | None = None
    if s.items_json:
        try:
            raw = json.loads(s.items_json)
            items = [ScheduleItem(**r) for r in raw] if isinstance(raw, list) else None
        except Exception:
            pass
    return ContractScheduleOut(
        id=s.id,
        tenant_id=s.tenant_id,
        contract_ref_key=s.contract_ref_key,
        basis_doc_type=s.basis_doc_type or "CONTRACT",
        doc_type_target=s.doc_type_target or "all",
        counterparty_key=s.counterparty_key,
        counterparty_name=s.counterparty_name or "",
        frequency=s.frequency,
        week_day=s.week_day,
        month_day=s.month_day,
        create_invoice=s.create_invoice,
        create_sale=s.create_sale,
        create_factura=s.create_factura,
        month_in_nomenclature=s.month_in_nomenclature,
        delivery_channel=s.delivery_channel,
        delivery_address=s.delivery_address,
        custom_fields=fields,
        items=items,
        template_invoice_ref=s.template_invoice_ref,
        is_active=s.is_active,
        next_run=s.next_run,
        last_run=s.last_run,
        run_count=s.run_count or 0,
        error_count=s.error_count or 0,
        last_error=s.last_error,
        created_at=s.created_at,
    )


def _contract_out(doc: OneCDocument, schedules: list[ContractSchedule]) -> ContractOut:
    raw: dict = {}
    if doc.items_json:
        try:
            raw = json.loads(doc.items_json)
        except Exception:
            pass
    return ContractOut(
        ref_key=doc.ref_key,
        name=doc.number or "",
        counterparty_key=doc.counterparty_key or "",
        counterparty_name=doc.counterparty_name or "",
        counterparty_inn=doc.counterparty_inn or "",
        amount=float(doc.amount or 0),
        date_start=doc.date,
        deletion_mark=bool(doc.deletion_mark),
        synced_at=doc.synced_at,
        raw_fields=raw,
        schedules=[_schedule_out(s) for s in schedules],
    )


# ── contract routes ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ContractOut])
async def list_contracts(
    tenant_id:       int = Depends(get_client_tenant),
    counterparty_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(OneCDocument).where(
        OneCDocument.tenant_id == tenant_id,
        OneCDocument.doc_type  == "CONTRACT",
        OneCDocument.deletion_mark == False,  # noqa: E712
    )
    if counterparty_key:
        q = q.where(OneCDocument.counterparty_key == counterparty_key)
    q = q.order_by(OneCDocument.date.desc(), OneCDocument.number)
    result = await db.execute(q)
    docs = result.scalars().all()

    ref_keys = [d.ref_key for d in docs]
    schedules_map: dict[str, list[ContractSchedule]] = {r: [] for r in ref_keys}
    if ref_keys:
        sq = select(ContractSchedule).where(
            ContractSchedule.tenant_id == tenant_id,
            ContractSchedule.contract_ref_key.in_(ref_keys),
        )
        sr = await db.execute(sq)
        for s in sr.scalars().all():
            schedules_map.setdefault(s.contract_ref_key, []).append(s)

    return [_contract_out(d, schedules_map.get(d.ref_key, [])) for d in docs]


@router.get("/{ref_key}", response_model=ContractOut)
async def get_contract(
    ref_key:   str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OneCDocument).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.ref_key   == ref_key,
            OneCDocument.doc_type  == "CONTRACT",
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Договор не найден")

    sr = await db.execute(
        select(ContractSchedule).where(
            ContractSchedule.tenant_id        == tenant_id,
            ContractSchedule.contract_ref_key == ref_key,
        )
    )
    schedules = list(sr.scalars().all())
    return _contract_out(doc, schedules)


@router.post("/{ref_key}/schedule", response_model=ContractScheduleOut)
async def upsert_schedule(
    ref_key:   str,
    body:      ContractScheduleCreate,
    tenant_id: int = Depends(get_client_tenant),
    target:    str = Query("all"),        # all | INVOICE | SALE | FACTURA
    basis:     str = Query("CONTRACT"),   # CONTRACT | INVOICE | SALE | FACTURA
    db: AsyncSession = Depends(get_db),
):
    """Создать/обновить расписание для любого документа-основания."""
    dr = await db.execute(
        select(OneCDocument).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.ref_key   == ref_key,
        )
    )
    doc = dr.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")

    # find existing schedule for this (ref_key, target)
    sr = await db.execute(
        select(ContractSchedule).where(
            ContractSchedule.tenant_id        == tenant_id,
            ContractSchedule.contract_ref_key == ref_key,
            ContractSchedule.doc_type_target  == target,
        )
    )
    s = sr.scalar_one_or_none()

    next_run = compute_contract_next_run(body.frequency, body.week_day, body.month_day)

    if s is None:
        s = ContractSchedule(
            tenant_id        = tenant_id,
            contract_ref_key = ref_key,
            counterparty_key = doc.counterparty_key or "",
            counterparty_name= doc.counterparty_name or "",
        )
        db.add(s)

    s.basis_doc_type        = basis
    s.doc_type_target       = target
    s.frequency             = body.frequency
    s.week_day              = body.week_day
    s.month_day             = body.month_day or "1"
    s.create_invoice        = body.create_invoice
    s.create_sale           = body.create_sale
    s.create_factura        = body.create_factura
    s.month_in_nomenclature = body.month_in_nomenclature
    s.delivery_channel      = body.delivery_channel
    s.delivery_address      = body.delivery_address
    s.custom_fields         = json.dumps(body.custom_fields) if body.custom_fields is not None else None
    s.items_json            = json.dumps([i.model_dump() for i in body.items]) if body.items else None
    s.template_invoice_ref  = body.template_invoice_ref or None
    s.is_active             = body.is_active
    s.next_run              = next_run
    s.updated_at            = datetime.utcnow()

    await db.commit()
    await db.refresh(s)
    return _schedule_out(s)


@router.delete("/{ref_key}/schedule", status_code=204)
async def delete_schedule(
    ref_key:   str,
    tenant_id: int = Depends(get_client_tenant),
    target:    str = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    sr = await db.execute(
        select(ContractSchedule).where(
            ContractSchedule.tenant_id        == tenant_id,
            ContractSchedule.contract_ref_key == ref_key,
            ContractSchedule.doc_type_target  == target,
        )
    )
    s = sr.scalar_one_or_none()
    if s:
        await db.delete(s)
        await db.commit()


@router.get("/{ref_key}/schedules", response_model=List[ContractScheduleOut])
async def list_schedules(
    ref_key:   str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Все расписания для документа (используется из вкладок Счета/Реализации/Сч-фактуры)."""
    sr = await db.execute(
        select(ContractSchedule).where(
            ContractSchedule.tenant_id        == tenant_id,
            ContractSchedule.contract_ref_key == ref_key,
        )
    )
    return [_schedule_out(s) for s in sr.scalars().all()]


@router.post("/sync", status_code=202)
async def sync_contracts(
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.tasks.sync_tasks import sync_one_tenant
    sync_one_tenant.delay(tenant_id)
    return {"status": "queued", "tenant_id": tenant_id}


@router.patch("/{ref_key}/schedule/custom-fields", response_model=ContractScheduleOut)
async def update_custom_fields(
    ref_key:      str,
    tenant_id:    int = Depends(get_client_tenant),
    target:       str = Query("all"),
    custom_fields: List[str] = [],
    db: AsyncSession = Depends(get_db),
):
    sr = await db.execute(
        select(ContractSchedule).where(
            ContractSchedule.tenant_id        == tenant_id,
            ContractSchedule.contract_ref_key == ref_key,
            ContractSchedule.doc_type_target  == target,
        )
    )
    s = sr.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Расписание не найдено")
    s.custom_fields = json.dumps(custom_fields)
    await db.commit()
    await db.refresh(s)
    return _schedule_out(s)
