"""КС-2 (Акт о приёмке выполненных работ) и КС-3 (Справка о стоимости выполненных работ
и затрат) — unified construction-industry forms, printed from a client's 1C "SALE"
(Реализация) document. 1C has no dedicated "Act" document type in this app's synced
schema, so SALE stands in for it — that's the same document a construction contractor
would otherwise print as an act anyway.

Fields that exist in neither 1C nor our own data model (Объект, Договор №/дата, Стройка,
addresses, ОКПО, Инвестор) are supplied by the accountant at print time. Every non-empty
value is remembered per (client, field) in ClientActFieldValue — see that model — so the
next print offers it back as a pick-from-history suggestion instead of a blank field or a
single silently-overwritten default. Отчётный период (period_from/period_to) is
deliberately NOT remembered — a date range is unique to each act by definition.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_tenant
from app.api.print_form import _num_to_words
from app.db.database import get_db
from app.models.act_field_value import ClientActFieldValue
from app.models.client_contact import ClientContact
from app.models.tenant import OneCDocument, Tenant
from app.services.branding import load_branding_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/act-forms", tags=["act-forms"])

# Fields the accountant fills in that get remembered (pick-from-history) per client.
REMEMBERED_FIELDS = [
    "object_name", "contract_number", "contract_date", "stroika_name",
    "podryadchik_address", "podryadchik_phone", "podryadchik_okpo",
    "zakazchik_address", "zakazchik_phone", "zakazchik_okpo",
    "investor_name", "investor_address", "investor_okpo", "okdp",
]


# ─── Remembered field-value history ────────────────────────────────────────────

@router.get("/field-values")
async def get_field_values(
    client_id: str,
    fields: str = Query(..., description="Comma-separated field names"),
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Suggestions for each requested field, most-recently-used first — powers the
    print modal's pick-from-history inputs."""
    names = [f.strip() for f in fields.split(",") if f.strip()]
    result: dict[str, list[str]] = {name: [] for name in names}
    if not names:
        return result
    res = await db.execute(
        select(ClientActFieldValue)
        .where(ClientActFieldValue.client_id == client_id, ClientActFieldValue.field_name.in_(names))
        .order_by(ClientActFieldValue.last_used_at.desc())
    )
    for row in res.scalars():
        result.setdefault(row.field_name, []).append(row.value)
    return result


@router.get("/{ref_key}/prefill")
async def get_prefill(
    ref_key: str,
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Договор №/от straight from 1C for this document, if it's linked to one —
    authoritative, takes priority over the field-value history in the print modal."""
    doc_res = await db.execute(
        select(OneCDocument).where(OneCDocument.tenant_id == tenant_id, OneCDocument.ref_key == ref_key)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    contract_number, contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    return {"contract_number": contract_number, "contract_date": contract_date}


async def _remember_fields(db: AsyncSession, client_id: str, values: dict[str, str]) -> None:
    for field_name, value in values.items():
        value = (value or "").strip()
        if not value or field_name not in REMEMBERED_FIELDS:
            continue
        existing = await db.execute(
            select(ClientActFieldValue).where(
                ClientActFieldValue.client_id == client_id,
                ClientActFieldValue.field_name == field_name,
                ClientActFieldValue.value == value,
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.last_used_at = datetime.utcnow()
        else:
            db.add(ClientActFieldValue(client_id=client_id, field_name=field_name, value=value))


# ─── Shared helpers ─────────────────────────────────────────────────────────────

def _fmt(v: Any, decimals: int = 2) -> str:
    try:
        n = float(v or 0)
        s = f"{n:,.{decimals}f}"
        return s.replace(",", " ").replace(".", ",")
    except Exception:
        return str(v)


def _fmt_date(d: Optional[datetime]) -> str:
    return d.strftime("%d.%m.%Y") if d else ""


async def _resolve_item_names(db: AsyncSession, tenant_id: int, items: list[dict]) -> dict[str, str]:
    """SALE items usually carry only Номенклатура_Key, no Содержание — 1C doesn't echo the
    catalog name back on line items. Resolve it properly: live Catalog_Номенклатура lookup
    (authoritative, same technique contracts.py's list_nomenclature uses), falling back to
    cross-referencing this tenant's already-synced INVOICE items (which sometimes do carry
    free-text Содержание) for anything the catalog doesn't cover."""
    keys = {it.get("Номенклатура_Key") for it in items if it.get("Номенклатура_Key") and not it.get("Содержание")}
    if not keys:
        return {}

    name_by_key: dict[str, str] = {}

    tenant = await db.get(Tenant, tenant_id)
    if tenant and tenant.odata_login and tenant.odata_url:
        try:
            from app.services.onec_odata import OneCODataClient
            client = OneCODataClient(login=tenant.odata_login, password=tenant.odata_password, base_url=tenant.odata_url)
            catalog = await asyncio.get_running_loop().run_in_executor(None, client.get_nomenclature_catalog)
            for it in catalog:
                ref = it.get("Ref_Key", "")
                name = (it.get("Description") or it.get("Наименование") or "").strip()
                if ref in keys and name:
                    name_by_key[ref] = name
        except Exception as exc:
            logger.warning("act_forms: nomenclature catalog lookup failed for tenant=%s: %s", tenant_id, exc)

    remaining = keys - set(name_by_key)
    if remaining:
        res = await db.execute(
            select(OneCDocument.items_json).where(
                OneCDocument.tenant_id == tenant_id,
                OneCDocument.doc_type == "INVOICE",
                OneCDocument.items_json.isnot(None),
            )
        )
        for (items_json,) in res.all():
            try:
                rows = json.loads(items_json)
            except Exception:
                continue
            for row in rows:
                k = row.get("Номенклатура_Key")
                name = row.get("Содержание")
                if k in remaining and name and k not in name_by_key:
                    name_by_key[k] = name

    return name_by_key


async def _resolve_contract(db: AsyncSession, tenant_id: int, contract_key: Optional[str]) -> tuple[str, str]:
    """Договор №/от, straight from the CONTRACT-type row 1C sync already stores locally
    (Catalog_ДоговорыКонтрагентов) — no extra 1C call needed, just a local join."""
    if not contract_key:
        return "", ""
    res = await db.execute(
        select(OneCDocument).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.doc_type == "CONTRACT",
            OneCDocument.ref_key == contract_key,
        )
    )
    contract = res.scalar_one_or_none()
    if not contract:
        return "", ""
    return contract.number or "", _fmt_date(contract.date)


async def _load_context(db: AsyncSession, tenant_id: int, client_id: str, ref_key: str):
    doc_res = await db.execute(
        select(OneCDocument).where(OneCDocument.tenant_id == tenant_id, OneCDocument.ref_key == ref_key)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")

    client = await db.get(ClientContact, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    items: list[dict] = []
    if doc.items_json:
        try:
            items = json.loads(doc.items_json)
        except Exception:
            pass
    name_by_key = await _resolve_item_names(db, tenant_id, items)

    rows = []
    for it in items:
        name = it.get("Содержание") or name_by_key.get(it.get("Номенклатура_Key"), "") or "—"
        rows.append({
            "name":   name,
            "qty":    float(it.get("Количество", 0) or 0),
            "price":  float(it.get("Цена", 0) or 0),
            "amount": float(it.get("Сумма", 0) or 0),
        })

    return doc, client, rows


_PAGE_STYLE = """
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 10pt; color: #000; padding: 12mm; }
  @media print { body { padding: 6mm; } .no-print { display: none !important; } @page { margin: 8mm; size: landscape; } }
  .print-btn { display: inline-block; margin-bottom: 10px; padding: 8px 18px; background: #1e40af; color: #fff;
               border: none; border-radius: 6px; font-size: 11pt; cursor: pointer; }
  .print-btn:hover { background: #1d4ed8; }
  .hdr-right { float: right; text-align: right; font-size: 8pt; width: 260px; }
  .title { text-align: center; font-weight: bold; font-size: 13pt; margin: 6px 0 2px; }
  .subtitle { text-align: center; font-size: 10pt; margin-bottom: 10px; }
  table.parties { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 9pt; }
  table.parties td { padding: 2px 4px; vertical-align: bottom; }
  table.parties .label { white-space: nowrap; font-weight: bold; }
  table.parties .fill { border-bottom: 1px solid #000; }
  .hint { font-size: 7pt; color: #666; text-align: center; }
  table.meta { border-collapse: collapse; margin: 8px 0; font-size: 9pt; }
  table.meta td, table.meta th { border: 1px solid #000; padding: 3px 8px; text-align: center; }
  table.items { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; }
  table.items th, table.items td { border: 1px solid #000; padding: 3px 5px; }
  table.items th { background: #f5f5f5; text-align: center; font-weight: bold; }
  table.items td.num { text-align: center; }
  table.items td.right { text-align: right; }
  .totals-row td { font-weight: bold; }
  .sign-block { margin-top: 24px; position: relative; }
  .sign-line { display: inline-block; width: 220px; border-bottom: 1px solid #000; margin: 0 8px; }
  .branding-logo { margin-bottom: 6px; }
  .branding-logo img { max-height: 60px; max-width: 220px; }
  .branding-text { font-size: 9pt; color: #333; margin: 8px 0; white-space: pre-wrap; }
  .branding-stamp { position: absolute; left: 0; top: -20px; display: flex; align-items: center; opacity: 0.85; pointer-events: none; }
</style>
"""


def _party_row(label: str, name: str, address: str, phone: str, okpo: str) -> str:
    extra = " · ".join(x for x in [address, phone and f"тел. {phone}"] if x)
    return f"""
    <tr>
      <td class="label" style="width:220px">{label}</td>
      <td class="fill">{name or "—"}{f" ({extra})" if extra else ""}</td>
      <td class="label" style="width:60px">по ОКПО</td>
      <td class="fill" style="width:100px">{okpo or ""}</td>
    </tr>"""


class FieldsQuery:
    """Shared query params for both КС-2 and КС-3 — every non-1C field the form needs."""
    def __init__(
        self,
        object_name:          str = Query("", alias="object"),
        contract_number:      str = Query(""),
        contract_date:        str = Query(""),
        period_from:          str = Query(""),
        period_to:            str = Query(""),
        stroika_name:         str = Query(""),
        podryadchik_address:  str = Query(""),
        podryadchik_phone:    str = Query(""),
        podryadchik_okpo:     str = Query(""),
        zakazchik_address:    str = Query(""),
        zakazchik_phone:      str = Query(""),
        zakazchik_okpo:       str = Query(""),
        investor_name:        str = Query(""),
        investor_address:     str = Query(""),
        investor_okpo:        str = Query(""),
        okdp:                 str = Query(""),
    ):
        self.object_name = object_name
        self.contract_number = contract_number
        self.contract_date = contract_date
        self.period_from = period_from
        self.period_to = period_to
        self.stroika_name = stroika_name
        self.podryadchik_address = podryadchik_address
        self.podryadchik_phone = podryadchik_phone
        self.podryadchik_okpo = podryadchik_okpo
        self.zakazchik_address = zakazchik_address
        self.zakazchik_phone = zakazchik_phone
        self.zakazchik_okpo = zakazchik_okpo
        self.investor_name = investor_name
        self.investor_address = investor_address
        self.investor_okpo = investor_okpo
        self.okdp = okdp

    def as_remember_dict(self) -> dict[str, str]:
        return {name: getattr(self, name) for name in REMEMBERED_FIELDS}


# ─── КС-2 ───────────────────────────────────────────────────────────────────────

def _build_ks2_html(doc: OneCDocument, client: ClientContact, rows: list[dict], f: FieldsQuery, branding: dict) -> str:
    items_html = ""
    total = 0.0
    for i, r in enumerate(rows, start=1):
        items_html += f"""
        <tr>
          <td class="num">{i}</td>
          <td>{r['name']}</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num">{_fmt(r['qty'])}</td>
          <td class="right">{_fmt(r['price'])}</td>
          <td class="right">{_fmt(r['amount'])}</td>
        </tr>"""
        total += r["amount"]
    if not items_html:
        items_html = '<tr><td colspan="7" class="num" style="color:#999">Позиции не загружены</td></tr>'

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>КС-2 № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}

<div class="hdr-right">
  Унифицированная форма № КС-2<br>
  Утверждена постановлением Госкомстата России<br>
  от 11.11.99 № 100
</div>
<div style="clear:both"></div>
{branding['text_header_html']}

<table class="parties">
  {_party_row("Инвестор", f.investor_name, f.investor_address, "", f.investor_okpo)}
  {_party_row("Заказчик (Генподрядчик)", doc.counterparty_name, f.zakazchik_address, f.zakazchik_phone, f.zakazchik_okpo)}
  {_party_row("Подрядчик (Субподрядчик)", client.name, f.podryadchik_address, f.podryadchik_phone, f.podryadchik_okpo)}
  <tr><td class="label">Стройка</td><td class="fill" colspan="3">{f.stroika_name or "—"}</td></tr>
  <tr><td class="label">Объект</td><td class="fill" colspan="3">{f.object_name or "—"}</td></tr>
</table>

<table class="meta">
  <tr><th>Договор подряда №</th><th>от</th><th>Номер документа</th><th>Дата составления</th><th>Отчётный период</th></tr>
  <tr>
    <td>{f.contract_number or "—"}</td>
    <td>{f.contract_date or "—"}</td>
    <td>{doc.number}</td>
    <td>{_fmt_date(doc.date)}</td>
    <td>{f.period_from or _fmt_date(doc.date)} — {f.period_to or _fmt_date(doc.date)}</td>
  </tr>
</table>

<div class="title">АКТ</div>
<div class="subtitle">О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ</div>

<table class="items">
  <thead>
    <tr>
      <th style="width:30px">№ п/п</th>
      <th>Наименование работ</th>
      <th style="width:90px">Номер единичной расценки</th>
      <th style="width:70px">Ед. изм.</th>
      <th style="width:70px">Количество</th>
      <th style="width:90px">Цена за единицу, ₽</th>
      <th style="width:100px">Стоимость, ₽</th>
    </tr>
  </thead>
  <tbody>
    {items_html}
    <tr class="totals-row"><td colspan="6" style="text-align:right">Всего по акту</td><td class="right">{_fmt(total)}</td></tr>
  </tbody>
</table>

{branding['text_footer_html']}

<div class="sign-block">
  {branding['stamp_html']}
  Сдал <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Принял <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

</body></html>"""


@router.get("/{ref_key}/ks2", response_class=HTMLResponse)
async def print_ks2(
    ref_key: str,
    client_id: str,
    f: FieldsQuery = Depends(),
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_context(db, tenant_id, client_id, ref_key)
    if not f.contract_number and not f.contract_date:
        f.contract_number, f.contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    await _remember_fields(db, client_id, f.as_remember_dict())
    await db.commit()
    return HTMLResponse(content=_build_ks2_html(doc, client, rows, f, branding))


# ─── КС-3 ───────────────────────────────────────────────────────────────────────

def _build_ks3_html(doc: OneCDocument, client: ClientContact, rows: list[dict], f: FieldsQuery, branding: dict) -> str:
    total = sum(r["amount"] for r in rows) or float(doc.amount or 0)
    # Simplified per the accepted scope: all three cumulative columns equal this act's amount
    # (no running-total-across-acts calculation) — each справка stands alone.
    amount_str = _fmt(total)

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>КС-3 № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}

<div class="hdr-right">
  Унифицированная форма № КС-3<br>
  Утверждена постановлением Госкомстата России<br>
  от 11.11.99 № 100
</div>
<div style="clear:both"></div>
{branding['text_header_html']}

<table class="parties">
  {_party_row("Инвестор", f.investor_name, f.investor_address, "", f.investor_okpo)}
  {_party_row("Заказчик (Генподрядчик)", doc.counterparty_name, f.zakazchik_address, f.zakazchik_phone, f.zakazchik_okpo)}
  {_party_row("Подрядчик (Субподрядчик)", client.name, f.podryadchik_address, f.podryadchik_phone, f.podryadchik_okpo)}
  <tr><td class="label">Стройка</td><td class="fill" colspan="3">{f.stroika_name or "—"}</td></tr>
  <tr><td class="label">Объект</td><td class="fill" colspan="3">{f.object_name or "—"}</td></tr>
</table>

<table class="meta">
  <tr><th>Договор подряда №</th><th>от</th><th>Номер документа</th><th>Дата составления</th><th>Отчётный период</th></tr>
  <tr>
    <td>{f.contract_number or "—"}</td>
    <td>{f.contract_date or "—"}</td>
    <td>{doc.number}</td>
    <td>{_fmt_date(doc.date)}</td>
    <td>{f.period_from or _fmt_date(doc.date)} — {f.period_to or _fmt_date(doc.date)}</td>
  </tr>
</table>

<div class="title">СПРАВКА</div>
<div class="subtitle">О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ</div>

<table class="items">
  <thead>
    <tr>
      <th style="width:40px">№ п/п</th>
      <th>Наименование работ, затрат</th>
      <th style="width:110px">Стоимость с начала проведения работ, ₽</th>
      <th style="width:110px">Стоимость с начала года, ₽</th>
      <th style="width:130px">В т.ч. за отчётный период, ₽</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="num">1</td>
      <td>Всего работ и затрат по акту № {doc.number} от {_fmt_date(doc.date)}</td>
      <td class="right">{amount_str}</td>
      <td class="right">{amount_str}</td>
      <td class="right">{amount_str}</td>
    </tr>
    <tr class="totals-row">
      <td colspan="2" style="text-align:right">Итого</td>
      <td class="right">{amount_str}</td>
      <td class="right">{amount_str}</td>
      <td class="right">{amount_str}</td>
    </tr>
  </tbody>
</table>

{branding['text_footer_html']}

<div class="sign-block">
  Заказчик (Генподрядчик) <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  {branding['stamp_html']}
  Подрядчик (Субподрядчик) <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

</body></html>"""


@router.get("/{ref_key}/ks3", response_class=HTMLResponse)
async def print_ks3(
    ref_key: str,
    client_id: str,
    f: FieldsQuery = Depends(),
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_context(db, tenant_id, client_id, ref_key)
    if not f.contract_number and not f.contract_date:
        f.contract_number, f.contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    await _remember_fields(db, client_id, f.as_remember_dict())
    await db.commit()
    return HTMLResponse(content=_build_ks3_html(doc, client, rows, f, branding))


# ─── Акт об оказании услуг ─────────────────────────────────────────────────────
# Unlike КС-2/КС-3, there is no single mandatory government form for a generic
# service act — 402-ФЗ only requires the standard primary-document elements
# (name, date, parties, transaction content, measurement, signatures). No
# manual fields needed: unlike KS-2/3 this doesn't reference an object/стройка,
# just the parties and договор already available from 1C.

def _build_service_act_html(doc: OneCDocument, client: ClientContact, rows: list[dict], vat_total: float,
                             contract_number: str, contract_date: str, branding: dict) -> str:
    items_html = ""
    total = 0.0
    for i, r in enumerate(rows, start=1):
        items_html += f"""
        <tr>
          <td class="num">{i}</td>
          <td>{r['name']}</td>
          <td class="num">шт</td>
          <td class="num">{_fmt(r['qty'])}</td>
          <td class="right">{_fmt(r['price'])}</td>
          <td class="right">{_fmt(r['amount'])}</td>
        </tr>"""
        total += r["amount"]
    if not items_html:
        items_html = '<tr><td colspan="6" class="num" style="color:#999">Позиции не загружены</td></tr>'

    # Item rows show pre-VAT amounts (standard practice); the total the customer actually
    # pays includes VAT — same distinction print_form.py's invoice makes between "Сумма" and
    # "Итого к оплате".
    grand_total = total + vat_total
    vat_note = f"в т.ч. НДС {_fmt(vat_total)} ₽" if vat_total else "НДС не облагается"
    amount_words = _num_to_words(grand_total)

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>Акт № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}

<div class="title">АКТ № {doc.number} от {_fmt_date(doc.date)}</div>
<div class="subtitle">об оказании услуг (выполнении работ)</div>
{branding['text_header_html']}

<table class="parties">
  {_party_row("Исполнитель", client.name, "", "", "")}
  {_party_row("Заказчик", doc.counterparty_name, "", "", doc.counterparty_inn or "")}
  <tr><td class="label">Договор №</td><td class="fill" colspan="3">{contract_number or "—"} от {contract_date or "—"}</td></tr>
</table>

<p style="margin:8px 0">
  Исполнитель оказал услуги (выполнил работы), а Заказчик принял их в полном объёме,
  надлежащего качества и в согласованные сроки. Стороны претензий друг к другу не имеют.
</p>

<table class="items">
  <thead>
    <tr>
      <th style="width:30px">№ п/п</th>
      <th>Наименование работ, услуг</th>
      <th style="width:60px">Ед. изм.</th>
      <th style="width:70px">Количество</th>
      <th style="width:90px">Цена, ₽</th>
      <th style="width:100px">Сумма, ₽</th>
    </tr>
  </thead>
  <tbody>
    {items_html}
    <tr class="totals-row"><td colspan="5" style="text-align:right">Итого без НДС</td><td class="right">{_fmt(total)}</td></tr>
    <tr class="totals-row"><td colspan="5" style="text-align:right">Всего к оплате ({vat_note})</td><td class="right">{_fmt(grand_total)}</td></tr>
  </tbody>
</table>

<div class="amount-words" style="margin:6px 0">{amount_words}</div>

{branding['text_footer_html']}

<div class="sign-block">
  {branding['stamp_html']}
  Исполнитель <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность, подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Заказчик <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность, подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

</body></html>"""


@router.get("/{ref_key}/service-act", response_class=HTMLResponse)
async def print_service_act(
    ref_key: str,
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_context(db, tenant_id, client_id, ref_key)
    vat_total = 0.0
    if doc.items_json:
        try:
            vat_total = sum(float(it.get("СуммаНДС", 0) or 0) for it in json.loads(doc.items_json))
        except Exception:
            pass
    contract_number, contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    return HTMLResponse(content=_build_service_act_html(doc, client, rows, vat_total, contract_number, contract_date, branding))


# ─── Накладная (простая) ────────────────────────────────────────────────────────
# Same shape as the service act (no strict government layout for a plain delivery
# note either) — just goods-appropriate wording ("отпустил"/"получил" instead of
# "исполнитель"/"заказчик"). For a fully unified goods-transfer form see ТОРГ-12
# in tax_forms.py — this one is the lightweight alternative for when that's overkill.

def _build_nakladnaya_html(doc: OneCDocument, client: ClientContact, rows: list[dict], vat_total: float,
                            contract_number: str, contract_date: str, branding: dict) -> str:
    items_html = ""
    total = 0.0
    for i, r in enumerate(rows, start=1):
        items_html += f"""
        <tr>
          <td class="num">{i}</td>
          <td>{r['name']}</td>
          <td class="num">шт</td>
          <td class="num">{_fmt(r['qty'])}</td>
          <td class="right">{_fmt(r['price'])}</td>
          <td class="right">{_fmt(r['amount'])}</td>
        </tr>"""
        total += r["amount"]
    if not items_html:
        items_html = '<tr><td colspan="6" class="num" style="color:#999">Позиции не загружены</td></tr>'

    grand_total = total + vat_total
    vat_note = f"в т.ч. НДС {_fmt(vat_total)} ₽" if vat_total else "НДС не облагается"
    amount_words = _num_to_words(grand_total)

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>Накладная № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}

<div class="title">НАКЛАДНАЯ № {doc.number} от {_fmt_date(doc.date)}</div>
{branding['text_header_html']}

<table class="parties">
  {_party_row("Поставщик", client.name, "", "", "")}
  {_party_row("Получатель", doc.counterparty_name, "", "", doc.counterparty_inn or "")}
  <tr><td class="label">Договор №</td><td class="fill" colspan="3">{contract_number or "—"} от {contract_date or "—"}</td></tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:30px">№ п/п</th>
      <th>Наименование товара</th>
      <th style="width:60px">Ед. изм.</th>
      <th style="width:70px">Количество</th>
      <th style="width:90px">Цена, ₽</th>
      <th style="width:100px">Сумма, ₽</th>
    </tr>
  </thead>
  <tbody>
    {items_html}
    <tr class="totals-row"><td colspan="5" style="text-align:right">Итого без НДС</td><td class="right">{_fmt(total)}</td></tr>
    <tr class="totals-row"><td colspan="5" style="text-align:right">Всего к оплате ({vat_note})</td><td class="right">{_fmt(grand_total)}</td></tr>
  </tbody>
</table>

<div class="amount-words" style="margin:6px 0">{amount_words}</div>

{branding['text_footer_html']}

<div class="sign-block">
  {branding['stamp_html']}
  Отпуск груза произвёл <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность, подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Груз получил <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность, подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

</body></html>"""


@router.get("/{ref_key}/nakladnaya", response_class=HTMLResponse)
async def print_nakladnaya(
    ref_key: str,
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_context(db, tenant_id, client_id, ref_key)
    vat_total = 0.0
    if doc.items_json:
        try:
            vat_total = sum(float(it.get("СуммаНДС", 0) or 0) for it in json.loads(doc.items_json))
        except Exception:
            pass
    contract_number, contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    return HTMLResponse(content=_build_nakladnaya_html(doc, client, rows, vat_total, contract_number, contract_date, branding))
