"""КС-2 (Акт о приёмке выполненных работ) и КС-3 (Справка о стоимости выполненных работ
и затрат) — unified construction-industry forms, printed from a client's 1C "SALE"
(Реализация) document. 1C has no dedicated "Act" document type in this app's synced
schema, so SALE stands in for it — that's the same document a construction contractor
would otherwise print as an act anyway.

Organizational boilerplate that exists in neither 1C nor our own data model (addresses,
phone numbers, ОКПО codes, Инвестор, Стройка) is stored per-client in ClientActProfile
and reused across every act — see app/models/act_profile.py. Per-act specifics (Объект,
Договор №/дата, отчётный период) are supplied fresh each time via query params.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_tenant
from app.db.database import get_db
from app.models.act_profile import ClientActProfile
from app.models.client_contact import ClientContact
from app.models.tenant import OneCDocument
from app.schemas.act_profile import ActProfileIn, ActProfileOut

router = APIRouter(prefix="/act-forms", tags=["act-forms"])


# ─── Per-client boilerplate profile ────────────────────────────────────────────

@router.get("/profile", response_model=ActProfileOut)
async def get_profile(
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(ClientActProfile, client_id)
    return ActProfileOut.model_validate(profile) if profile else ActProfileOut()


@router.put("/profile", response_model=ActProfileOut)
async def set_profile(
    client_id: str,
    data: ActProfileIn,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(ClientActProfile, client_id)
    if profile is None:
        profile = ClientActProfile(client_id=client_id)
        db.add(profile)
    for field, value in data.model_dump().items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return ActProfileOut.model_validate(profile)


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
    """SALE items often lack Содержание (only Номенклатура_Key) — cross-reference this
    tenant's INVOICE items, which do carry Содержание, by matching key. Same technique
    contracts.py's list_nomenclature uses to merge catalog data from synced documents."""
    keys = {it.get("Номенклатура_Key") for it in items if it.get("Номенклатура_Key") and not it.get("Содержание")}
    if not keys:
        return {}
    res = await db.execute(
        select(OneCDocument.items_json).where(
            OneCDocument.tenant_id == tenant_id,
            OneCDocument.doc_type == "INVOICE",
            OneCDocument.items_json.isnot(None),
        )
    )
    name_by_key: dict[str, str] = {}
    for (items_json,) in res.all():
        try:
            rows = json.loads(items_json)
        except Exception:
            continue
        for row in rows:
            k = row.get("Номенклатура_Key")
            name = row.get("Содержание")
            if k in keys and name and k not in name_by_key:
                name_by_key[k] = name
    return name_by_key


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

    profile = await db.get(ClientActProfile, client_id)

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

    return doc, client, profile, rows


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
  .sign-block { margin-top: 24px; }
  .sign-line { display: inline-block; width: 220px; border-bottom: 1px solid #000; margin: 0 8px; }
  .guid { font-size: 7pt; color: #999; margin-top: 14px; text-align: center; }
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


# ─── КС-2 ───────────────────────────────────────────────────────────────────────

def _build_ks2_html(doc: OneCDocument, client: ClientContact, profile: Optional[ClientActProfile],
                     rows: list[dict], object_name: str, contract_number: str, contract_date: str,
                     period_from: str, period_to: str) -> str:
    p = profile
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

<div class="hdr-right">
  Унифицированная форма № КС-2<br>
  Утверждена постановлением Госкомстата России<br>
  от 11.11.99 № 100
</div>
<div style="clear:both"></div>

<table class="parties">
  {_party_row("Инвестор", p.investor_name if p else "", p.investor_address if p else "", "", p.investor_okpo if p else "")}
  {_party_row("Заказчик (Генподрядчик)", doc.counterparty_name, p.zakazchik_address if p else "", p.zakazchik_phone if p else "", p.zakazchik_okpo if p else "")}
  {_party_row("Подрядчик (Субподрядчик)", client.name, p.podryadchik_address if p else "", p.podryadchik_phone if p else "", p.podryadchik_okpo if p else "")}
  <tr><td class="label">Стройка</td><td class="fill" colspan="3">{(p.stroika_name if p else "") or "—"}</td></tr>
  <tr><td class="label">Объект</td><td class="fill" colspan="3">{object_name or "—"}</td></tr>
</table>

<table class="meta">
  <tr><th>Договор подряда №</th><th>от</th><th>Номер документа</th><th>Дата составления</th><th>Отчётный период</th></tr>
  <tr>
    <td>{contract_number or "—"}</td>
    <td>{contract_date or "—"}</td>
    <td>{doc.number}</td>
    <td>{_fmt_date(doc.date)}</td>
    <td>{period_from or _fmt_date(doc.date)} — {period_to or _fmt_date(doc.date)}</td>
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

<div class="sign-block">
  Сдал <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Принял <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

<div class="guid">1C GUID: {doc.ref_key}</div>
</body></html>"""


@router.get("/{ref_key}/ks2", response_class=HTMLResponse)
async def print_ks2(
    ref_key: str,
    client_id: str,
    object_name:     str = Query("", alias="object"),
    contract_number: str = Query(""),
    contract_date:   str = Query(""),
    period_from:     str = Query(""),
    period_to:       str = Query(""),
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, profile, rows = await _load_context(db, tenant_id, client_id, ref_key)
    return HTMLResponse(content=_build_ks2_html(
        doc, client, profile, rows, object_name, contract_number, contract_date, period_from, period_to,
    ))


# ─── КС-3 ───────────────────────────────────────────────────────────────────────

def _build_ks3_html(doc: OneCDocument, client: ClientContact, profile: Optional[ClientActProfile],
                     rows: list[dict], object_name: str, contract_number: str, contract_date: str,
                     period_from: str, period_to: str) -> str:
    p = profile
    total = sum(r["amount"] for r in rows) or float(doc.amount or 0)
    # Simplified per the accepted scope: all three cumulative columns equal this act's amount
    # (no running-total-across-acts calculation) — each справка stands alone.
    amount_str = _fmt(total)

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>КС-3 № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

<div class="hdr-right">
  Унифицированная форма № КС-3<br>
  Утверждена постановлением Госкомстата России<br>
  от 11.11.99 № 100
</div>
<div style="clear:both"></div>

<table class="parties">
  {_party_row("Инвестор", p.investor_name if p else "", p.investor_address if p else "", "", p.investor_okpo if p else "")}
  {_party_row("Заказчик (Генподрядчик)", doc.counterparty_name, p.zakazchik_address if p else "", p.zakazchik_phone if p else "", p.zakazchik_okpo if p else "")}
  {_party_row("Подрядчик (Субподрядчик)", client.name, p.podryadchik_address if p else "", p.podryadchik_phone if p else "", p.podryadchik_okpo if p else "")}
  <tr><td class="label">Стройка</td><td class="fill" colspan="3">{(p.stroika_name if p else "") or "—"}</td></tr>
  <tr><td class="label">Объект</td><td class="fill" colspan="3">{object_name or "—"}</td></tr>
</table>

<table class="meta">
  <tr><th>Договор подряда №</th><th>от</th><th>Номер документа</th><th>Дата составления</th><th>Отчётный период</th></tr>
  <tr>
    <td>{contract_number or "—"}</td>
    <td>{contract_date or "—"}</td>
    <td>{doc.number}</td>
    <td>{_fmt_date(doc.date)}</td>
    <td>{period_from or _fmt_date(doc.date)} — {period_to or _fmt_date(doc.date)}</td>
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

<div class="sign-block">
  Заказчик (Генподрядчик) <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Подрядчик (Субподрядчик) <span class="sign-line"></span> <span class="sign-line"></span> <span class="sign-line"></span><br>
  <span style="font-size:8pt;color:#666">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(должность)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>

<div class="guid">1C GUID: {doc.ref_key}</div>
</body></html>"""


@router.get("/{ref_key}/ks3", response_class=HTMLResponse)
async def print_ks3(
    ref_key: str,
    client_id: str,
    object_name:     str = Query("", alias="object"),
    contract_number: str = Query(""),
    contract_date:   str = Query(""),
    period_from:     str = Query(""),
    period_to:       str = Query(""),
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, profile, rows = await _load_context(db, tenant_id, client_id, ref_key)
    return HTMLResponse(content=_build_ks3_html(
        doc, client, profile, rows, object_name, contract_number, contract_date, period_from, period_to,
    ))
