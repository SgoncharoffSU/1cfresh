"""
Celery task: fires recurring document schedules.
Uses synchronous SQLAlchemy (same pattern as sync_tasks.py) to avoid
the asyncio event-loop conflict in forked Celery workers.
"""
import json
import logging
import traceback
from datetime import datetime, timezone, timedelta
from decimal import Decimal

_MOSCOW = timezone(timedelta(hours=3))


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)

import requests as http_requests

from app.celery_app import celery_app

logger = logging.getLogger(__name__)

# Auto-disable a schedule after this many consecutive errors
MAX_ERRORS = 5


def _sync_engine():
    from sqlalchemy import create_engine
    from app.config import settings
    url = settings.DATABASE_URL
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("mysql+aiomysql://",     "mysql+pymysql://")
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    return create_engine(url, pool_pre_ping=True)


def _send_via_tg(bot_token: str, chat_id: str, text: str) -> bool:
    """Send a text message via Telegram Bot API. Returns True on success."""
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        r = http_requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=10)
        data = r.json()
        if data.get("ok"):
            return True
        logger.warning("TG send failed: %s", data.get("description"))
    except Exception as exc:
        logger.warning("TG send error: %s", exc)
    return False


def _format_invoice_text(
    number: str, date: datetime, cp_name: str, amount: float,
    print_url: str, message: str | None = None,
) -> str:
    """Format invoice as a Telegram-friendly text message."""
    date_str   = date.strftime("%d.%m.%Y") if date else "—"
    amount_str = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    lines = []
    if message:
        lines += [f"💬 {message}", ""]
    lines += [
        f"📄 <b>Счёт на оплату №{number}</b>",
        f"📅 от {date_str}",
        f"👤 {cp_name}",
        f"💰 Итого: <b>{amount_str} ₽</b>",
        "",
        f'🔗 <a href="{print_url}">Открыть печатную форму</a>',
    ]
    return "\n".join(lines)


@celery_app.task(name="app.tasks.schedule_tasks.check_document_schedules")
def check_document_schedules() -> dict:
    from sqlalchemy.orm import Session
    from app.models.schedule import DocumentSchedule
    from app.models.tenant import OneCDocument, Tenant
    from app.services.onec_odata import OneCODataClient
    from app.services.schedule_service import compute_next_run
    from app.config import settings

    engine = _sync_engine()
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")

    # External URL for print forms (used in TG messages)
    api_external = getattr(settings, "API_EXTERNAL_URL", "http://159.194.225.55:8018")

    fired = 0
    errors = 0

    with Session(engine) as db:
        now = _now_moscow()

        schedules = (
            db.query(DocumentSchedule)
            .filter(
                DocumentSchedule.is_active == True,    # noqa: E712
                DocumentSchedule.next_run  <= now,
            )
            .all()
        )

        if not schedules:
            return {"fired": 0, "errors": 0}

        tenant_ids = {s.tenant_id for s in schedules}
        tenants = {
            t.id: t
            for t in db.query(Tenant)
            .filter(Tenant.id.in_(tenant_ids), Tenant.is_active == True)  # noqa: E712
            .all()
        }

        for s in schedules:
            tenant = tenants.get(s.tenant_id)
            if not tenant:
                logger.warning("DocSchedule %s: tenant %s not found", s.id, s.tenant_id)
                continue

            try:
                # Load original document for its line items
                orig = (
                    db.query(OneCDocument)
                    .filter_by(tenant_id=s.tenant_id, ref_key=s.document_ref_key)
                    .first()
                )
                items: list[dict] = []
                if orig and orig.items_json:
                    try:
                        items = json.loads(orig.items_json)
                    except (json.JSONDecodeError, TypeError):
                        pass

                # POST new invoice to 1C (with is_posted flag)
                client = OneCODataClient(
                    login    = tenant.odata_login,
                    password = tenant.odata_password,
                    base_url = tenant.odata_url,
                )
                created = client.create_invoice(
                    counterparty_key = s.counterparty_key,
                    amount           = float(s.amount or 0),
                    items            = items,
                    is_posted        = bool(s.is_posted),
                )

                ref_key  = created.get("Ref_Key", "")
                number   = str(created.get("Number", ""))
                date_raw = created.get("Date") or now.isoformat()
                doc_date = datetime.fromisoformat(str(date_raw)[:19])

                # Провести документ отдельным action-запросом, если требуется
                if s.is_posted and ref_key:
                    try:
                        client.post_document(ref_key)
                        logger.info("DocSchedule %s → 1C №%s guid=%s POSTED", s.id, number, ref_key)
                    except Exception as post_exc:
                        logger.warning("DocSchedule %s: post_document failed: %s", s.id, post_exc)

                logger.info("DocSchedule %s → 1C №%s guid=%s posted=%s", s.id, number, ref_key, s.is_posted)

                # Resolve contractor name/inn if not stored
                cp_name = s.counterparty_name or ""
                cp_inn  = ""
                if not cp_name and s.counterparty_key:
                    cp_name, cp_inn = client.get_contractor(s.counterparty_key)

                # Store the new document locally so it appears immediately
                if ref_key:
                    existing = db.query(OneCDocument).filter_by(
                        tenant_id=s.tenant_id, ref_key=ref_key
                    ).first()
                    if not existing:
                        new_doc = OneCDocument(
                            tenant_id         = s.tenant_id,
                            ref_key           = ref_key,
                            doc_type          = "INVOICE",
                            number            = number,
                            date              = doc_date,
                            counterparty_key  = s.counterparty_key,
                            counterparty_name = cp_name,
                            counterparty_inn  = cp_inn,
                            amount            = Decimal(str(s.amount or 0)),
                            is_posted         = bool(s.is_posted),
                            items_json        = json.dumps(items, ensure_ascii=False),
                            comment           = f"Создан по расписанию #{s.id}",
                            synced_at         = now,
                        )
                        db.add(new_doc)

                # ── Send via delivery channel ──────────────────────────────────
                if s.delivery_channel and s.delivery_address and ref_key:
                    print_url = f"{api_external}/api/v1/documents/{ref_key}/print?tenant_id={s.tenant_id}"
                    if s.delivery_channel == "TG" and bot_token:
                        text = _format_invoice_text(
                            number    = number,
                            date      = doc_date,
                            cp_name   = cp_name or s.counterparty_name,
                            amount    = float(s.amount or 0),
                            print_url = print_url,
                            message   = s.message or None,
                        )
                        sent = _send_via_tg(bot_token, s.delivery_address, text)
                        s.last_delivery_ok = sent
                        s.last_delivery_at = now
                        if sent:
                            logger.info("DocSchedule %s: invoice sent via TG to %s", s.id, s.delivery_address)
                        else:
                            logger.warning("DocSchedule %s: TG send failed (invoice still created)", s.id)

                # Advance schedule & reset error counter on success
                config          = json.loads(s.schedule_config)
                s.last_run      = now
                s.run_count     = (s.run_count or 0) + 1
                s.next_run      = compute_next_run(s.schedule_type, config, now)
                s.error_count   = 0
                s.last_error    = None
                fired += 1

            except Exception as exc:
                err_msg = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-500:]}"
                logger.error("DocSchedule %s failed: %s", s.id, exc, exc_info=True)
                s.error_count = (s.error_count or 0) + 1
                s.last_error  = str(exc)[:500]
                if s.error_count >= MAX_ERRORS:
                    s.is_active = False
                    logger.error("DocSchedule %s auto-disabled after %d errors", s.id, s.error_count)
                errors += 1

        db.commit()

    logger.info("check_document_schedules: fired=%d errors=%d", fired, errors)
    return {"fired": fired, "errors": errors}
