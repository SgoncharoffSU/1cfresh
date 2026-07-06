"""
Celery task: выставление документов по расписанию договоров.
"""
from __future__ import annotations

import json
import locale
import logging
import traceback
from datetime import datetime, timezone, timedelta
from decimal import Decimal

_MOSCOW = timezone(timedelta(hours=3))

MONTH_NAMES_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

# Винительный падеж — для "за [месяц] [год]"
MONTH_NAMES_ACC = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

import requests as http_requests

from app.celery_app import celery_app

logger = logging.getLogger(__name__)
MAX_ERRORS = 5


def _now_moscow() -> datetime:
    return datetime.now(_MOSCOW).replace(tzinfo=None)


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
    try:
        r = http_requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        return r.json().get("ok", False)
    except Exception as exc:
        logger.warning("TG send error: %s", exc)
        return False


def _send_via_email(smtp_settings: dict, to: str, subject: str, body: str, pdf_url: str | None) -> bool:
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = smtp_settings.get("user", "")
        msg["To"]      = to

        html = f"<p>{body}</p>"
        if pdf_url:
            html += f'<p><a href="{pdf_url}">Открыть документ</a></p>'
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(smtp_settings["host"], smtp_settings["port"]) as s:
            s.starttls()
            s.login(smtp_settings["user"], smtp_settings["password"])
            s.sendmail(smtp_settings["user"], to, msg.as_string())
        return True
    except Exception as exc:
        logger.warning("Email send error: %s", exc)
        return False


def _patch_nomenclature_month(items: list[dict], month: int, year: int) -> list[dict]:
    """Добавить название месяца в поле Содержание каждой строки номенклатуры."""
    month_name = MONTH_NAMES_GEN[month - 1]
    result = []
    for item in items:
        item = dict(item)
        content = item.get("Содержание", "") or ""
        if month_name.lower() not in content.lower():
            item["Содержание"] = f"{content} {month_name} {year}".strip()
        result.append(item)
    return result


@celery_app.task(name="app.tasks.contract_tasks.check_contract_schedules")
def check_contract_schedules() -> dict:
    from sqlalchemy.orm import Session
    from app.models.contract_schedule import ContractSchedule
    from app.models.tenant import OneCDocument, Tenant
    from app.services.onec_odata import OneCODataClient
    from app.services.contract_schedule_service import compute_contract_next_run
    from app.config import settings

    engine    = _sync_engine()
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    api_ext   = getattr(settings, "API_EXTERNAL_URL", "http://159.194.225.55:8018")
    smtp_cfg  = {
        "host":     getattr(settings, "SMTP_HOST", ""),
        "port":     getattr(settings, "SMTP_PORT", 587),
        "user":     getattr(settings, "SMTP_USER", ""),
        "password": getattr(settings, "SMTP_PASSWORD", ""),
    }

    fired = errors = 0

    with Session(engine) as db:
        now = _now_moscow()

        schedules = (
            db.query(ContractSchedule)
            .filter(
                ContractSchedule.is_active == True,   # noqa: E712
                ContractSchedule.next_run  <= now,
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
                continue
            try:
                # Загрузить исходный договор
                orig = db.query(OneCDocument).filter_by(
                    tenant_id=s.tenant_id, ref_key=s.contract_ref_key
                ).first()

                client = OneCODataClient(
                    login    = tenant.odata_login,
                    password = tenant.odata_password,
                    base_url = tenant.odata_url,
                )

                # ── Получить номенклатуру ────────────────────────────────────
                # Приоритет: 1) ручные строки расписания, 2) эталонный счёт, 3) ничего
                sched_items: list[dict] | None = None
                if s.items_json:
                    try:
                        raw_si = json.loads(s.items_json)
                        if isinstance(raw_si, list) and raw_si:
                            sched_items = raw_si
                    except Exception:
                        pass

                if sched_items is None and s.template_invoice_ref:
                    try:
                        tmpl = client.get_document(
                            s.template_invoice_ref, "Document_СчетНаОплатуПокупателю"
                        )
                        if tmpl and tmpl.get("Товары"):
                            sched_items = tmpl["Товары"]
                    except Exception as e:
                        logger.warning("Schedule %s: cannot load template invoice: %s", s.id, e)

                # Конвертируем формат расписания → формат 1С Товары
                override_items: list[dict] | None = None
                if sched_items:
                    override_items = []
                    mo = now.month
                    yr = now.year
                    for i, r in enumerate(sched_items):
                        nom_key = (r.get("nomenclature_key")
                                   or r.get("Номенклатура_Key")
                                   or None)
                        description = str(r.get("description", r.get("Содержание", "")) or "")
                        # Автодобавление месяца для ежемесячных услуг
                        periodicity = r.get("periodicity") or ""
                        if periodicity == "Месяц":
                            month_name_acc = MONTH_NAMES_ACC[mo - 1]
                            if month_name_acc.lower() not in description.lower():
                                description = f"{description} за {month_name_acc} {yr}".strip()
                        qty   = float(r.get("qty", r.get("Количество", 1)) or 1)
                        price = float(r.get("price", r.get("Цена", 0)) or 0)
                        row: dict = {
                            "LineNumber": str(i + 1),
                            "Содержание": description,
                            "Количество": qty,
                            "Цена":       price,
                            "Сумма":      qty * price,
                        }
                        if nom_key:
                            # НДС не передаём — 1С заполнит из справочника номенклатуры
                            row["Номенклатура_Key"] = nom_key
                        else:
                            row["СтавкаНДС"] = str(r.get("vat", r.get("СтавкаНДС", "БезНДС")) or "БезНДС")
                            row["СуммаНДС"]  = 0.0
                        override_items.append(row)

                # Итоговый список номенклатуры для документов
                items = list(override_items) if override_items else []

                created_refs: list[tuple[str, str, str]] = []  # (ref_key, number, type)
                target = getattr(s, "doc_type_target", "all") or "all"

                if target in ("all", "INVOICE"):
                    # Создать счёт на оплату
                    if target == "all" and not s.create_invoice:
                        pass  # флаг снят
                    else:
                        inv = client.create_invoice(
                            counterparty_key = s.counterparty_key,
                            amount           = float(orig.amount if orig else 0),
                            items            = items,
                            is_posted        = True,
                            contract_key     = s.contract_ref_key,
                        )
                        ref = inv.get("Ref_Key", "")
                        num = str(inv.get("Number", ""))
                        if ref:
                            client.post_document(ref)
                            created_refs.append((ref, num, "INVOICE"))
                            _save_doc(db, s.tenant_id, ref, "INVOICE", num,
                                      inv.get("Date"), s.counterparty_key,
                                      orig, items, now, s.id)

                if target == "SALE":
                    # Реализация на основании исходного документа
                    try:
                        sale = client.create_sale_from_invoice(
                            s.contract_ref_key, is_posted=True,
                            override_items=override_items,
                            contract_key=s.contract_ref_key,
                        )
                        sale_ref = sale.get("Ref_Key", "")
                        sale_num = str(sale.get("Number", ""))
                        if sale_ref:
                            created_refs.append((sale_ref, sale_num, "SALE"))
                            _save_doc(db, s.tenant_id, sale_ref, "SALE", sale_num,
                                      sale.get("Date"), s.counterparty_key,
                                      orig, items, now, s.id, basis_key=s.contract_ref_key)
                    except Exception as e:
                        logger.warning("ContractSchedule %s: create SALE failed: %s", s.id, e)

                elif target == "FACTURA":
                    # Счёт-фактура на основании исходного документа
                    try:
                        factura = client.create_factura_from_invoice(
                            s.contract_ref_key, is_posted=True,
                            source_entity="Document_СчетНаОплатуПокупателю",
                            override_items=override_items,
                            contract_key=s.contract_ref_key,
                        )
                        f_ref = factura.get("Ref_Key", "")
                        f_num = str(factura.get("Number", ""))
                        if f_ref:
                            created_refs.append((f_ref, f_num, "FACTURA"))
                            _save_doc(db, s.tenant_id, f_ref, "FACTURA", f_num,
                                      factura.get("Date"), s.counterparty_key,
                                      orig, items, now, s.id, basis_key=s.contract_ref_key)
                    except Exception as e:
                        logger.warning("ContractSchedule %s: create FACTURA failed: %s", s.id, e)

                elif target == "all":
                    # Реализация из счёта (с той же номенклатурой)
                    if s.create_sale and created_refs:
                        inv_ref = created_refs[0][0]
                        try:
                            sale = client.create_sale_from_invoice(
                                inv_ref, is_posted=True,
                                override_items=override_items,
                                contract_key=s.contract_ref_key,
                            )
                            sale_ref = sale.get("Ref_Key", "")
                            sale_num = str(sale.get("Number", ""))
                            if sale_ref:
                                client.post_document(sale_ref, "Document_РеализацияТоваровУслуг")
                                created_refs.append((sale_ref, sale_num, "SALE"))
                                _save_doc(db, s.tenant_id, sale_ref, "SALE", sale_num,
                                          sale.get("Date"), s.counterparty_key,
                                          orig, items, now, s.id, basis_key=inv_ref)
                        except Exception as e:
                            logger.warning("ContractSchedule %s: create SALE failed: %s", s.id, e)

                    # Счёт-фактура из реализации (если создана) или из счёта
                    if s.create_factura and created_refs:
                        sale_entry = next((r for r in created_refs if r[2] == "SALE"), None)
                        if sale_entry:
                            src_ref    = sale_entry[0]
                            src_entity = "Document_РеализацияТоваровУслуг"
                        else:
                            src_ref    = created_refs[0][0]
                            src_entity = "Document_СчетНаОплатуПокупателю"
                        try:
                            factura = client.create_factura_from_invoice(
                                src_ref, is_posted=True, source_entity=src_entity,
                                override_items=override_items,
                                contract_key=s.contract_ref_key,
                            )
                            f_ref = factura.get("Ref_Key", "")
                            f_num = str(factura.get("Number", ""))
                            if f_ref:
                                created_refs.append((f_ref, f_num, "FACTURA"))
                                _save_doc(db, s.tenant_id, f_ref, "FACTURA", f_num,
                                          factura.get("Date"), s.counterparty_key,
                                          orig, items, now, s.id, basis_key=src_ref)
                        except Exception as e:
                            logger.warning("ContractSchedule %s: create FACTURA failed: %s", s.id, e)

                # ── Доставка ──────────────────────────────────────────────────
                if s.delivery_channel and s.delivery_address and created_refs:
                    inv_ref, inv_num, _ = created_refs[0]
                    print_url = f"{api_ext}/api/v1/documents/{inv_ref}/print?tenant_id={s.tenant_id}"
                    cp_name   = s.counterparty_name or s.counterparty_key

                    if s.delivery_channel == "TG" and bot_token:
                        text = _build_tg_text(inv_num, now, cp_name,
                                              float(orig.amount if orig else 0),
                                              print_url, created_refs)
                        sent = _send_via_tg(bot_token, s.delivery_address, text)
                        s.last_delivery_ok = sent
                        s.last_delivery_at = now

                    elif s.delivery_channel == "EMAIL" and smtp_cfg.get("host"):
                        subject = f"Документы по договору: {orig.number if orig else ''}"
                        body    = f"Автоматически созданы документы по договору с {cp_name}."
                        sent    = _send_via_email(smtp_cfg, s.delivery_address, subject, body, print_url)
                        s.last_delivery_ok = sent
                        s.last_delivery_at = now

                # Advance schedule
                s.next_run   = compute_contract_next_run(s.frequency, s.week_day, s.month_day, now)
                s.last_run   = now
                s.run_count  = (s.run_count or 0) + 1
                s.error_count = 0
                s.last_error  = None
                fired += 1

            except Exception as exc:
                logger.error("ContractSchedule %s failed: %s", s.id, exc, exc_info=True)
                s.error_count = (s.error_count or 0) + 1
                s.last_error  = str(exc)[:500]
                if s.error_count >= MAX_ERRORS:
                    s.is_active = False
                errors += 1

        db.commit()

    logger.info("check_contract_schedules: fired=%d errors=%d", fired, errors)
    return {"fired": fired, "errors": errors}


def _save_doc(db, tenant_id, ref_key, doc_type, number, date_raw,
              cp_key, orig, items, now, schedule_id, basis_key=None):
    from app.models.tenant import OneCDocument
    existing = db.query(OneCDocument).filter_by(tenant_id=tenant_id, ref_key=ref_key).first()
    if existing:
        return
    doc_date = None
    if date_raw:
        try:
            doc_date = datetime.fromisoformat(str(date_raw)[:19])
        except Exception:
            pass
    db.add(OneCDocument(
        tenant_id        = tenant_id,
        ref_key          = ref_key,
        doc_type         = doc_type,
        number           = number,
        date             = doc_date,
        counterparty_key  = cp_key,
        counterparty_name = orig.counterparty_name if orig else "",
        counterparty_inn  = orig.counterparty_inn  if orig else "",
        amount           = Decimal(str(orig.amount if orig else 0)),
        is_posted        = True,
        items_json       = json.dumps(items, ensure_ascii=False),
        comment          = f"Создан по договору #{schedule_id}",
        synced_at        = now,
        basis_key        = basis_key,
    ))


def _build_tg_text(inv_num, date, cp_name, amount, print_url, refs):
    lines = [
        f"📋 <b>Документы по договору</b>",
        f"👤 {cp_name}",
        f"📅 {date.strftime('%d.%m.%Y')}",
        "",
    ]
    type_labels = {"INVOICE": "Счёт", "SALE": "Реализация", "FACTURA": "Счёт-фактура"}
    for ref, num, dtype in refs:
        lines.append(f"• {type_labels.get(dtype, dtype)}: №{num}")
    lines += ["", f'🔗 <a href="{print_url}">Открыть счёт</a>']
    return "\n".join(lines)
