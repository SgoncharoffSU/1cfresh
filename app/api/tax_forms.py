"""Счёт-фактура и УПД (Универсальный передаточный документ) — self-rendered from a
client's SALE (Реализация) document data, since 1C:Fresh's OData interface has no
print-form export for any document type (confirmed via $metadata inspection).

Layout follows Постановление Правительства РФ №1137, as amended by Постановление
№26 от 23.01.2026 (effective 2026-04-01): adds строка 5б (avance счёт-фактура
№/дата — filled in only when this shipment offsets a previously received
prepayment; left blank otherwise, which is the correct default absent a reliable
way to detect that offset from the document's own data). УПД has no single
mandatory government form (it's a ФНС-recommended layout combining a
накладная/акт with the счёт-фактура fields under "статус 1"); the счёт-фактура
portion within it follows the same regulated structure.

Seller requisites (name/ИНН/ОГРН/КПП, bank account, director) are resolved live
from 1C at print time — Document_РеализацияТоваровУслуг carries Организация_Key/
Руководитель_Key/БанковскийСчетОрганизации_Key directly, one hop further to
Catalog_Организации/Catalog_ФизическиеЛица/Catalog_БанковскиеСчета/Catalog_Банки.
Buyer address and seller legal address are not reliably available this way (no
direct field on Catalog_Организации, and OneCDocument doesn't cache the
counterparty's address) — rendered as "—" rather than reintroducing manual
fields, since the brief here is "everything from 1C."
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.act_forms import _fmt, _fmt_date, _resolve_item_names
from app.api.deps import get_client_tenant
from app.api.print_form import VAT_LABEL
from app.db.database import get_db
from app.models.client_contact import ClientContact
from app.models.tenant import OneCDocument, Tenant
from app.services.branding import load_branding_html
from app.services.seller_info import resolve_seller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tax-forms", tags=["tax-forms"])

_SALE_ENTITY = "Document_РеализацияТоваровУслуг"


async def _load_tax_context(db: AsyncSession, tenant_id: int, client_id: str, ref_key: str):
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
            "name":       name,
            "qty":        float(it.get("Количество", 0) or 0),
            "price":      float(it.get("Цена", 0) or 0),
            "amount":     float(it.get("Сумма", 0) or 0),
            "vat_rate":   str(it.get("СтавкаНДС", "") or ""),
            "vat_amount": float(it.get("СуммаНДС", 0) or 0),
        })

    return doc, client, rows


async def _resolve_seller(tenant: Tenant, ref_key: str) -> dict:
    return await resolve_seller(tenant, ref_key, _SALE_ENTITY)


_PAGE_STYLE = """
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #000; padding: 10mm; }
  @media print { body { padding: 6mm; } .no-print { display: none !important; } @page { margin: 6mm; size: landscape; } }
  .print-btn { display: inline-block; margin-bottom: 10px; padding: 8px 18px; background: #1e40af; color: #fff;
               border: none; border-radius: 6px; font-size: 11pt; cursor: pointer; }
  .print-btn:hover { background: #1d4ed8; }
  .title { text-align: center; font-weight: bold; font-size: 12pt; margin: 4px 0 8px; }
  .status-badge { float: right; border: 1px solid #000; padding: 2px 8px; font-weight: bold; }
  table.hdr { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8.5pt; }
  table.hdr td { padding: 1px 4px; vertical-align: bottom; }
  table.hdr .label { white-space: nowrap; }
  table.hdr .fill { border-bottom: 1px solid #000; }
  table.items { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 8pt; }
  table.items th, table.items td { border: 1px solid #000; padding: 2px 4px; }
  table.items th { background: #f5f5f5; text-align: center; font-weight: normal; }
  table.items td.num { text-align: center; }
  table.items td.right { text-align: right; }
  .totals-row td { font-weight: bold; }
  .sign-block { margin-top: 20px; position: relative; }
  .sign-line { display: inline-block; width: 200px; border-bottom: 1px solid #000; margin: 0 8px; }
  .small { font-size: 7pt; color: #666; }
  .branding-logo { margin-bottom: 6px; }
  .branding-logo img { max-height: 60px; max-width: 220px; }
  .branding-text { font-size: 9pt; color: #333; margin: 8px 0; white-space: pre-wrap; }
  .branding-stamp { position: absolute; left: 0; top: -20px; display: flex; align-items: center; opacity: 0.85; pointer-events: none; }
</style>
"""


def _vat_label(raw: str) -> str:
    return VAT_LABEL.get(raw, raw or "—")


def _items_table_html(rows: list[dict], without_vat: bool) -> tuple[str, float, float, float]:
    """Shared 1-11-column item table used by both Счёт-фактура and УПД (status 1).
    Returns (html, subtotal_without_vat, total_vat, grand_total)."""
    body = ""
    subtotal = vat_total = grand_total = 0.0
    for i, r in enumerate(rows, start=1):
        vat_amount = 0.0 if without_vat else r["vat_amount"]
        line_total = r["amount"] + vat_amount
        subtotal += r["amount"]
        vat_total += vat_amount
        grand_total += line_total
        vat_cell = "без НДС" if without_vat else _vat_label(r["vat_rate"])
        vat_amount_cell = "—" if without_vat else _fmt(vat_amount)
        body += f"""
        <tr>
          <td class="num">—</td>
          <td class="num">{i}</td>
          <td>{r['name']}</td>
          <td class="num">шт</td>
          <td class="num">—</td>
          <td class="num">{_fmt(r['qty'])}</td>
          <td class="right">{_fmt(r['price'])}</td>
          <td class="right">{_fmt(r['amount'])}</td>
          <td class="num">без акциза</td>
          <td class="num">{vat_cell}</td>
          <td class="right">{vat_amount_cell}</td>
          <td class="right">{_fmt(line_total)}</td>
          <td class="num">—</td>
          <td class="num">—</td>
        </tr>"""
    if not body:
        body = '<tr><td colspan="14" class="num" style="color:#999">Позиции не загружены</td></tr>'
    html = f"""
    <table class="items">
      <thead>
        <tr>
          <th>А</th><th>1</th><th>1а</th><th>1б</th><th>2</th><th>3</th><th>4</th><th>5</th>
          <th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th>
        </tr>
        <tr class="small">
          <td class="num">Код</td><td class="num">№</td><td>Товар/работа/услуга</td>
          <td class="num">Ед.</td><td class="num">ТН ВЭД</td><td class="num">Кол-во</td>
          <td class="num">Цена</td><td class="num">Стоимость без НДС</td><td class="num">Акциз</td>
          <td class="num">Ставка НДС</td><td class="num">Сумма НДС</td><td class="num">Стоимость с НДС</td>
          <td class="num">Страна</td><td class="num">№ ГТД</td>
        </tr>
      </thead>
      <tbody>
        {body}
        <tr class="totals-row">
          <td colspan="7" style="text-align:right">Всего к оплате</td>
          <td class="right">{_fmt(subtotal)}</td>
          <td class="num">x</td>
          <td class="num">x</td>
          <td class="right">{'—' if without_vat else _fmt(vat_total)}</td>
          <td class="right">{_fmt(grand_total)}</td>
          <td class="num">x</td>
          <td class="num">x</td>
        </tr>
      </tbody>
    </table>"""
    return html, subtotal, vat_total, grand_total


def _seller_buyer_header(doc: OneCDocument, client: ClientContact, seller: dict, contract_number: str, contract_date: str) -> str:
    seller_bank_line = (
        f"р/с {seller['bank_account']} в {seller['bank_name']}, к/с {seller['bank_corr_account']}, БИК {seller['bank_bik']}"
        if seller["bank_account"] else "—"
    )
    return f"""
<table class="hdr">
  <tr><td class="label">Продавец:</td><td class="fill" colspan="3">{seller['name'] or client.name}</td></tr>
  <tr><td class="label">Адрес:</td><td class="fill" colspan="3">—</td></tr>
  <tr><td class="label">ИНН/КПП продавца:</td><td class="fill">{seller['inn'] or '—'} / {seller['kpp'] or '—'}</td>
      <td class="label">ОГРН(ИП):</td><td class="fill">{seller['ogrn'] or '—'}</td></tr>
  <tr><td class="label">Грузоотправитель и его адрес:</td><td class="fill" colspan="3">он же / услуги — не применимо</td></tr>
  <tr><td class="label">Грузополучатель и его адрес:</td><td class="fill" colspan="3">—</td></tr>
  <tr><td class="label">Реквизиты банка продавца:</td><td class="fill" colspan="3">{seller_bank_line}</td></tr>
  <tr><td class="label">К платёжно-расчётному документу №:</td><td class="fill">—</td>
      <td class="label">от:</td><td class="fill">—</td></tr>
  <tr><td class="label">Документ об отгрузке (5а):</td><td class="fill">{doc.number} от {_fmt_date(doc.date)}</td>
      <td class="label">Аванс. счёт-фактура (5б):</td><td class="fill">—</td></tr>
  <tr><td class="label">Покупатель:</td><td class="fill" colspan="3">{doc.counterparty_name or "—"}</td></tr>
  <tr><td class="label">Адрес:</td><td class="fill" colspan="3">—</td></tr>
  <tr><td class="label">ИНН/КПП покупателя:</td><td class="fill" colspan="3">{doc.counterparty_inn or '—'} / —</td></tr>
  <tr><td class="label">Валюта: наименование, код:</td><td class="fill">Российский рубль, 643</td>
      <td class="label">Договор №/от:</td><td class="fill">{contract_number or '—'} / {contract_date or '—'}</td></tr>
</table>"""


# ─── Счёт-фактура ────────────────────────────────────────────────────────────────

def _build_schet_faktura_html(doc: OneCDocument, client: ClientContact, rows: list[dict], seller: dict,
                               contract_number: str, contract_date: str, branding: dict) -> str:
    items_html, subtotal, vat_total, grand_total = _items_table_html(rows, seller["without_vat"])

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>Счёт-фактура № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}

<div class="title">СЧЁТ-ФАКТУРА № {doc.number} от {_fmt_date(doc.date)}</div>
<p class="small" style="text-align:center">Форма по Постановлению Правительства РФ №1137 (в редакции №26 от 23.01.2026, действует с 01.04.2026)</p>
{branding['text_header_html']}

{_seller_buyer_header(doc, client, seller, contract_number, contract_date)}

{items_html}

{branding['text_footer_html']}

<div class="sign-block">
  {branding['stamp_html']}
  Руководитель организации <span class="sign-line"></span> {seller['director_name'] or ''}<br>
  <span class="small">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span>
</div>
<div class="sign-block">
  Главный бухгалтер <span class="sign-line"></span><br>
  <span class="small">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(расшифровка подписи)</span><br>
  <span class="small">или Индивидуальный предприниматель — реквизиты свидетельства о государственной регистрации: ОГРН {seller['ogrn'] or '—'}</span>
</div>

</body></html>"""


@router.get("/{ref_key}/schet-faktura", response_class=HTMLResponse)
async def print_schet_faktura(
    ref_key: str,
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_tax_context(db, tenant_id, client_id, ref_key)
    tenant = await db.get(Tenant, tenant_id)
    seller = await _resolve_seller(tenant, ref_key)
    contract_number, contract_date = "", ""
    if doc.contract_key:
        from app.api.act_forms import _resolve_contract
        contract_number, contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    return HTMLResponse(content=_build_schet_faktura_html(doc, client, rows, seller, contract_number, contract_date, branding))


# ─── УПД ─────────────────────────────────────────────────────────────────────────

def _build_upd_html(doc: OneCDocument, client: ClientContact, rows: list[dict], seller: dict,
                     contract_number: str, contract_date: str, branding: dict) -> str:
    status = "2" if seller["without_vat"] else "1"
    items_html, subtotal, vat_total, grand_total = _items_table_html(rows, seller["without_vat"])

    sf_block = "" if seller["without_vat"] else f"""
<div class="sign-block">
  {branding['stamp_html']}
  Руководитель организации <span class="sign-line"></span> {seller['director_name'] or ''}<br>
  <span class="small">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись, статус 1 — счёт-фактура)</span>
</div>
<div class="sign-block">
  Главный бухгалтер <span class="sign-line"></span><br>
  <span class="small">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)</span>
</div>"""

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>УПД № {doc.number}</title>{_PAGE_STYLE}</head><body>

<div class="no-print"><button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button></div>

{branding['logo_html']}
<div class="status-badge">Статус {status}</div>
<div style="clear:both"></div>

<div class="title">УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ № {doc.number} от {_fmt_date(doc.date)}</div>
<p class="small" style="text-align:center">
  Статус {status} — {"со счётом-фактурой" if status == "1" else "без НДС, только накладная/акт"}.
  Рекомендованная форма ФНС (письмо ММВ-7-15/155@), с учётом изменений по счёту-фактуре с 01.04.2026.
</p>
{branding['text_header_html']}

{_seller_buyer_header(doc, client, seller, contract_number, contract_date)}

{items_html}

{branding['text_footer_html']}

<div class="sign-block">
  Товар (груз) передал / услуги, результаты работ сдал <span class="sign-line"></span> {seller['director_name'] or ''}<br>
  <span class="small">(должность, подпись, расшифровка подписи — сторона продавца)</span>
</div>
<div class="sign-block">
  Ответственный за правильность оформления факта хозяйственной жизни (продавец) <span class="sign-line"></span><br>
  <span class="small">(должность, подпись, расшифровка подписи)</span>
</div>
{sf_block}
<div class="sign-block">
  Товар (груз) получил / услуги, результаты работ принял <span class="sign-line"></span><br>
  <span class="small">(должность, подпись, расшифровка подписи — сторона покупателя)</span>
</div>
<div class="sign-block">
  Ответственный за правильность оформления факта хозяйственной жизни (покупатель) <span class="sign-line"></span><br>
  <span class="small">(должность, подпись, расшифровка подписи)</span>
</div>

</body></html>"""


@router.get("/{ref_key}/upd", response_class=HTMLResponse)
async def print_upd(
    ref_key: str,
    client_id: str,
    tenant_id: int = Depends(get_client_tenant),
    db: AsyncSession = Depends(get_db),
):
    doc, client, rows = await _load_tax_context(db, tenant_id, client_id, ref_key)
    tenant = await db.get(Tenant, tenant_id)
    seller = await _resolve_seller(tenant, ref_key)
    contract_number, contract_date = "", ""
    if doc.contract_key:
        from app.api.act_forms import _resolve_contract
        contract_number, contract_date = await _resolve_contract(db, tenant_id, doc.contract_key)
    branding = await load_branding_html(db, client_id)
    return HTMLResponse(content=_build_upd_html(doc, client, rows, seller, contract_number, contract_date, branding))
