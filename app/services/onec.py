import base64
import logging
from typing import Optional

import httpx

from app.config import settings
from app.schemas.invoice import InvoiceCreate

logger = logging.getLogger(__name__)

_UNIT_OKEI = {"шт": "796", "час": "356", "м": "006", "кг": "166", "л": "112", "упак": "778"}
_VAT_CODES = {20.0: "НДС20", 10.0: "НДС10", 0.0: "НДС0", -1.0: "БезНДС"}
_NULL_GUID = "00000000-0000-0000-0000-000000000000"


class OneCService:
    def __init__(self) -> None:
        self.odata = f"{settings.ONEC_BASE_URL.rstrip('/')}/odata/standard.odata"
        self.hs = f"{settings.ONEC_BASE_URL.rstrip('/')}/hs"
        self._auth = (settings.ONEC_USERNAME, settings.ONEC_PASSWORD)
        self._hdrs = {"Content-Type": "application/json;charset=utf-8", "Accept": "application/json"}
        self._rub_guid: Optional[str] = None

    # ------------------------------------------------------------------ public

    async def create_invoice(self, invoice: InvoiceCreate) -> str:
        """POST Document_СчетНаОплатуПокупателю → return Ref_Key (GUID)."""
        contractor_guid = await self._get_or_create_contractor(invoice.client_inn, invoice.client_name)
        rub_guid = await self._get_rub_guid()

        rows = []
        for i, item in enumerate(invoice.items, start=1):
            nom_guid = await self._get_or_create_nomenclature(item.name)
            unit_guid = await self._get_unit_guid(item.unit)
            sum_ = round(item.quantity * item.price, 2)
            vat_code = _VAT_CODES.get(item.vat_rate, "НДС20")
            vat_sum = round(sum_ * item.vat_rate / (100 + item.vat_rate), 2)
            rows.append(
                {
                    "LineNumber": str(i),
                    "Номенклатура_Key": nom_guid,
                    "НоменклатураНаименование": item.name,
                    "Количество": item.quantity,
                    "ЕдиницаИзмерения_Key": unit_guid,
                    "Цена": item.price,
                    "Сумма": sum_,
                    "СтавкаНДС": vat_code,
                    "СуммаНДС": vat_sum,
                }
            )

        payload = {
            "Date": invoice.date.strftime("%Y-%m-%dT%H:%M:%S") if invoice.date else "0001-01-01T00:00:00",
            "Number": invoice.number,
            "Организация_Key": settings.ONEC_ORG_GUID,
            "Контрагент_Key": contractor_guid,
            "ВалютаДокумента_Key": rub_guid,
            "СчетНаОплатуПокупателяТовары": rows,
            "СчетНаОплатуПокупателяУслуги": [],
        }

        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.post(
                f"{self.odata}/Document_СчетНаОплатуПокупателю",
                json=payload,
                headers=self._hdrs,
                timeout=30.0,
            )
            r.raise_for_status()
            guid: str = r.json()["Ref_Key"]
            logger.info("1C invoice created guid=%s", guid)
            return guid

    async def get_invoice_pdf(self, guid: str) -> bytes:
        """
        Fetch invoice PDF from 1C.
        Tries 3 strategies in order:
          1. OData FunctionImport ПолучитьПечатнуюФормуСчета
          2. HTTP-сервис /hs/invoices/pdf/{guid}
          3. OData action СформироватьПечатнуюФорму on the document
        """
        pdf = await self._pdf_via_odata_function(guid)
        if pdf:
            return pdf

        pdf = await self._pdf_via_http_service(guid)
        if pdf:
            return pdf

        return await self._pdf_via_document_action(guid)

    # ----------------------------------------------------------------- private

    async def _pdf_via_odata_function(self, guid: str) -> Optional[bytes]:
        try:
            async with httpx.AsyncClient(auth=self._auth) as c:
                r = await c.get(
                    f"{self.odata}/ПолучитьПечатнуюФормуСчета",
                    params={"Ссылка": f"guid'{guid}'", "ИмяМакета": "'СчетНаОплату'"},
                    headers=self._hdrs,
                    timeout=60.0,
                )
                if r.status_code in (404, 405):
                    return None
                r.raise_for_status()
                data = r.json()
                raw = data.get("ДанныеФайла") or data.get("value") or data.get("Data")
                if raw:
                    return base64.b64decode(raw)
        except httpx.HTTPStatusError:
            pass
        return None

    async def _pdf_via_http_service(self, guid: str) -> Optional[bytes]:
        try:
            async with httpx.AsyncClient(auth=self._auth) as c:
                r = await c.get(
                    f"{self.hs}/invoices/pdf/{guid}",
                    timeout=60.0,
                )
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/pdf"):
                    return r.content
        except (httpx.HTTPStatusError, httpx.RequestError):
            pass
        return None

    async def _pdf_via_document_action(self, guid: str) -> bytes:
        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.post(
                f"{self.odata}/Document_СчетНаОплатуПокупателю(guid'{guid}')/СформироватьПечатнуюФорму",
                json={"ИмяМакета": "СчетНаОплату"},
                headers=self._hdrs,
                timeout=60.0,
            )
            r.raise_for_status()
            data = r.json()
            raw = data.get("ДанныеФайла") or data.get("value") or data.get("Data")
            if not raw:
                raise ValueError(f"No PDF data in 1C response, keys: {list(data.keys())}")
            return base64.b64decode(raw)

    async def _get_or_create_contractor(self, inn: str, name: str) -> str:
        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.get(
                f"{self.odata}/Catalog_Контрагенты",
                params={"$filter": f"ИНН eq '{inn}'", "$select": "Ref_Key", "$top": "1"},
                headers=self._hdrs,
                timeout=15.0,
            )
            r.raise_for_status()
            items = r.json().get("value", [])
            if items:
                return items[0]["Ref_Key"]

            cr = await c.post(
                f"{self.odata}/Catalog_Контрагенты",
                json={"Description": name, "ИНН": inn, "ЮридическоеФизическоеЛицо": "ЮридическоеЛицо"},
                headers=self._hdrs,
                timeout=15.0,
            )
            cr.raise_for_status()
            return cr.json()["Ref_Key"]

    async def _get_or_create_nomenclature(self, name: str) -> str:
        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.get(
                f"{self.odata}/Catalog_Номенклатура",
                params={"$filter": f"Description eq '{name}'", "$select": "Ref_Key", "$top": "1"},
                headers=self._hdrs,
                timeout=15.0,
            )
            r.raise_for_status()
            items = r.json().get("value", [])
            if items:
                return items[0]["Ref_Key"]

            cr = await c.post(
                f"{self.odata}/Catalog_Номенклатура",
                json={"Description": name, "ВидНоменклатуры": "Услуга"},
                headers=self._hdrs,
                timeout=15.0,
            )
            cr.raise_for_status()
            return cr.json()["Ref_Key"]

    async def _get_unit_guid(self, unit: str) -> str:
        code = _UNIT_OKEI.get(unit.lower(), "796")
        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.get(
                f"{self.odata}/Catalog_КлассификаторЕдиницИзмерения",
                params={"$filter": f"Код eq '{code}'", "$select": "Ref_Key", "$top": "1"},
                headers=self._hdrs,
                timeout=15.0,
            )
            r.raise_for_status()
            items = r.json().get("value", [])
            return items[0]["Ref_Key"] if items else _NULL_GUID

    async def _get_rub_guid(self) -> str:
        if self._rub_guid:
            return self._rub_guid
        async with httpx.AsyncClient(auth=self._auth) as c:
            r = await c.get(
                f"{self.odata}/Catalog_Валюты",
                params={"$filter": "Code eq 'RUB'", "$select": "Ref_Key", "$top": "1"},
                headers=self._hdrs,
                timeout=15.0,
            )
            r.raise_for_status()
            items = r.json().get("value", [])
            self._rub_guid = items[0]["Ref_Key"] if items else _NULL_GUID
            return self._rub_guid


onec_service = OneCService()
