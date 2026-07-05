"""
HTML print form for invoices. Opens in the browser with print-ready styling.
GET /api/v1/documents/{ref_key}/print?tenant_id=1
"""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.tenant import OneCDocument, Tenant
from app.services.branding import load_branding_html

router = APIRouter(prefix="/documents", tags=["print"])

VAT_LABEL: dict[str, str] = {
    "БезНДС":    "Без НДС",
    "НДС0":      "0%",
    "НДС10":     "10%",
    "НДС18":     "18%",
    "НДС20":     "20%",
    "НДС10/110": "10/110",
    "НДС18/118": "18/118",
    "НДС20/120": "20/120",
}


def _fmt(v: Any, decimals: int = 2) -> str:
    try:
        n = float(v or 0)
        s = f"{n:,.{decimals}f}"
        return s.replace(",", " ").replace(".", ",")
    except Exception:
        return str(v)


def _num_to_words(n: float) -> str:
    """Very basic Russian amount-in-words (hundreds only for demo)."""
    try:
        rub = int(n)
        kop = round((n - rub) * 100)
    except Exception:
        return ""
    units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
             "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
             "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
    tens  = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят",
             "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
    hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот",
                "шестьсот", "семьсот", "восемьсот", "девятьсот"]

    def below_1000(x: int) -> str:
        parts = []
        if x >= 100:
            parts.append(hundreds[x // 100])
            x %= 100
        if x >= 20:
            parts.append(tens[x // 10])
            x %= 10
        if x > 0:
            parts.append(units[x])
        return " ".join(parts)

    if rub == 0:
        rub_str = "ноль"
    elif rub < 1000:
        rub_str = below_1000(rub)
    elif rub < 1_000_000:
        th = rub // 1000
        rem = rub % 1000
        # thousands in feminine
        th_units_f = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
                      "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
                      "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
        th_str = below_1000(th)
        # patch feminine ones/twos
        if th_str.endswith("один"):
            th_str = th_str[:-4] + "одна"
        elif th_str.endswith("два"):
            th_str = th_str[:-3] + "две"
        if th % 10 == 1 and th % 100 != 11:
            th_word = "тысяча"
        elif th % 10 in (2, 3, 4) and th % 100 not in (12, 13, 14):
            th_word = "тысячи"
        else:
            th_word = "тысяч"
        rub_str = f"{th_str} {th_word}"
        if rem:
            rub_str += f" {below_1000(rem)}"
    else:
        rub_str = f"{rub}"  # fallback for millions+

    rub_decl = "рубль" if rub % 10 == 1 and rub % 100 != 11 else (
        "рубля" if rub % 10 in (2, 3, 4) and rub % 100 not in (12, 13, 14) else "рублей"
    )
    kop_str = f"{kop:02d}"
    kop_decl = "копейка" if kop % 10 == 1 and kop % 100 != 11 else (
        "копейки" if kop % 10 in (2, 3, 4) and kop % 100 not in (12, 13, 14) else "копеек"
    )
    return f"{rub_str.capitalize()} {rub_decl} {kop_str} {kop_decl}"


def _build_html(doc: OneCDocument, branding: dict) -> str:
    items: list[dict] = []
    if doc.items_json:
        try:
            items = json.loads(doc.items_json)
        except Exception:
            pass

    doc_date = ""
    if doc.date:
        doc_date = doc.date.strftime("%d.%m.%Y")

    amount = float(doc.amount or 0)
    amount_str = _fmt(amount)
    amount_words = _num_to_words(amount)

    rows_html = ""
    total_vat = Decimal("0")
    for i, item in enumerate(items, start=1):
        name     = str(item.get("Содержание") or item.get("Номенклатура", "") or "—")
        qty      = _fmt(item.get("Количество", 1), 2)
        price    = _fmt(item.get("Цена", 0), 2)
        itm_sum  = _fmt(item.get("Сумма", 0), 2)
        vat_r    = VAT_LABEL.get(str(item.get("СтавкаНДС", "")), item.get("СтавкаНДС", "—") or "—")
        vat_a    = _fmt(item.get("СуммаНДС", 0), 2)
        total_vat += Decimal(str(item.get("СуммаНДС", 0) or 0))

        rows_html += f"""
        <tr>
          <td class="center">{i}</td>
          <td>{name}</td>
          <td class="center">шт</td>
          <td class="right">{qty}</td>
          <td class="right">{price}</td>
          <td class="right">{itm_sum}</td>
          <td class="center">{vat_r}</td>
          <td class="right">{vat_a}</td>
        </tr>"""

    vat_total_str = _fmt(float(total_vat), 2)

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Счёт №{doc.number} от {doc_date}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: Arial, sans-serif;
    font-size: 10pt;
    color: #000;
    padding: 15mm 15mm 10mm;
  }}
  @media print {{
    body {{ padding: 8mm; }}
    .no-print {{ display: none !important; }}
    @page {{ margin: 10mm; }}
  }}

  .print-btn {{
    display: inline-block;
    margin-bottom: 12px;
    padding: 8px 20px;
    background: #1e40af;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 11pt;
    cursor: pointer;
  }}
  .print-btn:hover {{ background: #1d4ed8; }}

  .bank-block {{
    border: 1px solid #000;
    padding: 6px 8px;
    margin-bottom: 4px;
    font-size: 9pt;
  }}
  .bank-block table {{ width: 100%; border-collapse: collapse; }}
  .bank-block td {{ padding: 1px 4px; vertical-align: top; }}
  .bank-block .label {{ width: 120px; color: #555; font-size: 8pt; }}

  h2 {{
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    margin: 8px 0 4px;
  }}
  .subtitle {{
    text-align: center;
    font-size: 9pt;
    margin-bottom: 10px;
  }}

  .parties {{ margin: 8px 0; }}
  .parties table {{ width: 100%; }}
  .parties td {{ padding: 2px 0; vertical-align: top; }}
  .parties .label {{ width: 80px; font-weight: bold; white-space: nowrap; }}

  table.items {{
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 9pt;
  }}
  table.items th, table.items td {{
    border: 1px solid #000;
    padding: 3px 5px;
    vertical-align: middle;
  }}
  table.items th {{
    background: #f5f5f5;
    font-weight: bold;
    text-align: center;
  }}
  table.items td.center {{ text-align: center; }}
  table.items td.right  {{ text-align: right; }}
  table.items tr:hover  {{ background: #fafafa; }}

  .totals {{ text-align: right; margin: 4px 0; font-size: 10pt; }}
  .totals strong {{ font-size: 11pt; }}
  .amount-words {{
    margin-top: 6px;
    font-size: 10pt;
    border-top: 1px solid #ccc;
    padding-top: 4px;
  }}
  .footer {{
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
  }}
  .footer .sign-block {{ width: 45%; }}
  .footer .sign-line {{
    border-bottom: 1px solid #000;
    margin-top: 30px;
    margin-bottom: 3px;
  }}
  .guid {{ font-size: 7pt; color: #999; margin-top: 10px; text-align: center; }}

  .branding-logo {{ margin-bottom: 6px; }}
  .branding-logo img {{ max-height: 60px; max-width: 220px; }}
  .branding-text {{ font-size: 9pt; color: #333; margin: 8px 0; white-space: pre-wrap; }}
  .footer .sign-block {{ position: relative; }}
  .branding-stamp {{ position: absolute; left: 20px; top: -15px; height: 90px; opacity: 0.85; pointer-events: none; }}
</style>
</head>
<body>

<div class="no-print" style="margin-bottom:10px">
  <button class="print-btn" onclick="window.print()">🖨 Распечатать / Сохранить PDF</button>
</div>

{branding['logo_html']}

<!-- Bank block placeholder -->
<div class="bank-block">
  <table>
    <tr>
      <td class="label">Получатель:</td>
      <td><strong>{doc.counterparty_name or "—"}</strong></td>
    </tr>
    <tr>
      <td class="label">ИНН:</td>
      <td>{doc.counterparty_inn or "—"}</td>
    </tr>
  </table>
</div>

<h2>СЧЁТ НА ОПЛАТУ № {doc.number}</h2>
<div class="subtitle">от {doc_date}</div>
{branding['text_header_html']}

<div class="parties">
  <table>
    <tr>
      <td class="label">Поставщик:</td>
      <td></td>
    </tr>
    <tr>
      <td class="label">Покупатель:</td>
      <td><strong>{doc.counterparty_name or "—"}</strong>
        {f"&nbsp;&nbsp;ИНН: {doc.counterparty_inn}" if doc.counterparty_inn else ""}
      </td>
    </tr>
  </table>
</div>

<table class="items">
  <thead>
    <tr>
      <th style="width:28px">№</th>
      <th>Товары (работы, услуги)</th>
      <th style="width:36px">Ед.</th>
      <th style="width:50px">Кол-во</th>
      <th style="width:80px">Цена, ₽</th>
      <th style="width:90px">Сумма, ₽</th>
      <th style="width:50px">НДС</th>
      <th style="width:80px">Сумма НДС</th>
    </tr>
  </thead>
  <tbody>
    {rows_html if rows_html else '<tr><td colspan="8" class="center" style="color:#999">Позиции не загружены</td></tr>'}
  </tbody>
</table>

<div class="totals">
  НДС итого: {vat_total_str} ₽<br>
  <strong>Итого к оплате: {amount_str} ₽</strong>
</div>

<div class="amount-words">
  {amount_words}
</div>

{branding['text_footer_html']}

<div class="footer">
  <div class="sign-block">
    {branding['stamp_html']}
    <div>Руководитель ________________</div>
    <div class="sign-line"></div>
    <div style="font-size:8pt;color:#666">подпись / расшифровка</div>
  </div>
  <div class="sign-block" style="text-align:right">
    <div>Бухгалтер ________________</div>
    <div class="sign-line"></div>
    <div style="font-size:8pt;color:#666">подпись / расшифровка</div>
  </div>
</div>

<div class="guid">1C GUID: {doc.ref_key}</div>

<script>
  // Auto-print if ?print=1 in URL
  if (new URLSearchParams(location.search).get('print') === '1') {{
    window.addEventListener('load', () => window.print());
  }}
</script>
</body>
</html>"""


@router.get("/{ref_key}/print", response_class=HTMLResponse)
async def print_invoice(
    ref_key: str,
    tenant_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OneCDocument).where(
            OneCDocument.ref_key == ref_key,
            OneCDocument.tenant_id == tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")

    tenant = await db.get(Tenant, tenant_id)
    branding = await load_branding_html(db, tenant.client_contact_id if tenant else None)
    return HTMLResponse(content=_build_html(doc, branding))
