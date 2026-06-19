"""
Synchronises documents from 1C:Fresh OData into the local onec_documents table.

Designed to be called from a Celery task (synchronous context).
Works with both MySQL and PostgreSQL.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.tenant import OneCDocument, Tenant
from app.services.onec_odata import OneCODataClient

logger = logging.getLogger(__name__)

_LOOKBACK_DAYS = 90
_MOSCOW = timezone(timedelta(hours=3))


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)


def _parse_date(raw: Any) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw)[:19])
    except ValueError:
        return None


def _resolve_contractors(
    client: OneCODataClient,
    docs: list[dict],
) -> dict[str, tuple[str, str]]:
    """Batch-resolve unique contractor GUIDs → {guid: (name, inn)}."""
    guids = {d.get("Контрагент_Key", "") for d in docs} - {"", None}
    result: dict[str, tuple[str, str]] = {}
    for guid in guids:
        result[guid] = client.get_contractor(guid)
    return result


def _upsert_documents(
    db: Session,
    tenant_id: int,
    docs: list[dict],
    doc_type: str,
    contractors: dict[str, tuple[str, str]],
) -> int:
    """Insert or update documents. Works with any DB (MySQL, PostgreSQL, SQLite)."""
    if not docs:
        return 0

    count = 0
    for d in docs:
        ref_key = d.get("Ref_Key", "")
        if not ref_key:
            continue

        ckey  = d.get("Контрагент_Key", "")
        cname, cinn = contractors.get(ckey, ("", ""))

        obj = db.query(OneCDocument).filter_by(
            tenant_id=tenant_id, ref_key=ref_key
        ).first()

        if obj is None:
            obj = OneCDocument(tenant_id=tenant_id, ref_key=ref_key)
            db.add(obj)

        obj.doc_type          = doc_type
        obj.number            = str(d.get("Number", "") or "")
        obj.date              = _parse_date(d.get("Date") or d.get("Дата"))
        obj.counterparty_key  = ckey
        obj.counterparty_name = cname
        obj.counterparty_inn  = cinn
        obj.amount            = Decimal(str(d.get("СуммаДокумента", 0) or 0))
        obj.is_posted         = bool(d.get("Posted", False))
        obj.deletion_mark     = bool(d.get("DeletionMark", False))
        obj.data_version      = str(d.get("DataVersion", ""))
        obj.items_json        = json.dumps(d.get("Товары", []), ensure_ascii=False)
        obj.comment           = str(d.get("Комментарий", "") or "")
        obj.synced_at         = _now_moscow()
        count += 1

    return count


def _delete_removed(
    db: Session,
    tenant_id: int,
    live_keys: set[str],
    doc_type: str,
    date_from: date,
) -> int:
    """Удалить из локальной БД документы, которых больше нет в 1С (в пределах окна синхронизации)."""
    cutoff = datetime(date_from.year, date_from.month, date_from.day)
    local_docs = (
        db.query(OneCDocument)
        .filter_by(tenant_id=tenant_id, doc_type=doc_type)
        .filter(OneCDocument.date >= cutoff)
        .all()
    )
    deleted = 0
    for doc in local_docs:
        if doc.ref_key not in live_keys:
            logger.info("Deleting removed doc tenant=%d ref=%s", tenant_id, doc.ref_key)
            db.delete(doc)
            deleted += 1
    return deleted


def sync_tenant(tenant: Tenant, db: Session) -> dict:
    """
    Pull last 90 days of invoices and sales from 1C, upsert into local DB.
    Returns {"invoices": N, "sales": M}.
    """
    client = OneCODataClient(
        login=tenant.odata_login,
        password=tenant.odata_password,
        base_url=tenant.odata_url,
    )

    date_from = date.today() - timedelta(days=_LOOKBACK_DAYS)
    # +3 days buffer: 1C returns dates in Moscow time (UTC+3), which can appear
    # as "tomorrow" relative to UTC. We never want to cut off recent documents.
    date_to   = date.today() + timedelta(days=3)

    logger.info("Syncing tenant=%d from %s to %s", tenant.id, date_from, date_to)

    try:
        invoices = client.get_invoices(date_from, date_to)
        logger.info("tenant=%d: fetched %d invoices", tenant.id, len(invoices))
    except Exception as exc:
        logger.error("tenant=%d: failed to fetch invoices: %s", tenant.id, exc)
        invoices = []

    try:
        sales = client.get_sales(date_from, date_to)
        logger.info("tenant=%d: fetched %d sales", tenant.id, len(sales))
    except Exception as exc:
        logger.error("tenant=%d: failed to fetch sales: %s", tenant.id, exc)
        sales = []

    all_docs = invoices + sales
    contractors = _resolve_contractors(client, all_docs)

    n_inv  = _upsert_documents(db, tenant.id, invoices, "INVOICE", contractors)
    n_sale = _upsert_documents(db, tenant.id, sales,    "SALE",    contractors)

    # Удалить документы, которых больше нет в 1С (в пределах окна 90 дней)
    live_invoice_keys = {d.get("Ref_Key", "") for d in invoices if d.get("Ref_Key")}
    live_sale_keys    = {d.get("Ref_Key", "") for d in sales    if d.get("Ref_Key")}
    n_del_inv  = _delete_removed(db, tenant.id, live_invoice_keys, "INVOICE", date_from)
    n_del_sale = _delete_removed(db, tenant.id, live_sale_keys,    "SALE",    date_from)

    db.commit()

    logger.info(
        "tenant=%d synced: %d invoices, %d sales; deleted: %d invoices, %d sales",
        tenant.id, n_inv, n_sale, n_del_inv, n_del_sale,
    )
    return {"invoices": n_inv, "sales": n_sale, "deleted": n_del_inv + n_del_sale}
