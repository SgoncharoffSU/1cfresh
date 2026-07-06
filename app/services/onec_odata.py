"""1С:Фреш OData API client."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone, timedelta
from typing import Any

_MOSCOW = timezone(timedelta(hours=3))

import requests
from requests.auth import HTTPBasicAuth
from requests.exceptions import ConnectionError, Timeout, RequestException

logger = logging.getLogger(__name__)

BASE_URL = "https://msk1.1cfresh.com/a/ea/4078741/odata/standard.odata"

HEADERS = {
    "Accept":       "application/json",
    "Content-Type": "application/json",
}


class OneCODataClient:
    """
    Клиент для работы с 1С:Фреш через OData API.

    1C:Fresh OData не поддерживает $filter по полю Date — все документы
    загружаются без фильтра, фильтрация по дате производится на стороне Python.
    """

    def __init__(self, login: str, password: str, base_url: str = BASE_URL, timeout: int = 30) -> None:
        self._auth    = HTTPBasicAuth(login, password)
        self._base    = base_url.rstrip("/")
        self._timeout = timeout
        self._session = requests.Session()
        self._session.auth    = self._auth
        self._session.headers.update(HEADERS)

    # ── internal ───────────────────────────────────────────────────────────────

    def _get(self, entity: str, params: dict | None = None) -> list[dict]:
        """GET entity list. Params with $ keys are sent via URL string to keep $ literal."""
        base_url = f"{self._base}/{entity}"
        if params:
            # Build query string keeping $ unencoded; requests would encode it
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{base_url}?{qs}"
        else:
            url = base_url

        logger.info("1C GET %s", url)
        try:
            # Pass URL via PreparedRequest.url override so requests doesn't re-encode the path
            req  = requests.Request("GET", url)
            prep = self._session.prepare_request(req)
            prep.url = url
            r = self._session.send(prep, timeout=self._timeout, verify=True)
            r.raise_for_status()
            return r.json().get("value", [])
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code in (401, 403):
                raise PermissionError(f"1С: нет доступа ({e.response.status_code})") from e
            logger.error("1C GET %s → %s %s", url, e, getattr(e.response, "text", "")[:200])
            raise
        except (ConnectionError, Timeout) as e:
            logger.error("1C network error: %s", e)
            raise
        except RequestException as e:
            logger.error("1C request error: %s", e)
            raise

    def _post(self, entity: str, payload: dict) -> dict:
        """POST to create a new document. Returns the created object (includes auto-assigned Number)."""
        url = f"{self._base}/{entity}?$format=json"
        logger.info("1C POST %s", url)
        try:
            req  = requests.Request("POST", url, json=payload)
            prep = self._session.prepare_request(req)
            prep.url = url
            r = self._session.send(prep, timeout=self._timeout, verify=True)
            r.raise_for_status()
            return r.json()
        except requests.HTTPError as e:
            logger.error("1C POST %s → %s %s", url, e, getattr(e.response, "text", "")[:300])
            raise
        except (ConnectionError, Timeout) as e:
            logger.error("1C network error: %s", e)
            raise

    def create_invoice(
        self,
        counterparty_key: str,
        amount: float,
        items: list[dict],
        is_posted: bool = False,
        contract_key: str | None = None,
    ) -> dict:
        """
        Create СчетНаОплатуПокупателю in 1C without a number (1C auto-assigns it).
        Returns the created document dict with Ref_Key, Number, Date.
        is_posted=True means the document is posted (проведен) in 1C.
        """
        payload: dict = {
            "Date":           datetime.now(_MOSCOW).strftime("%Y-%m-%dT%H:%M:%S"),
            "Контрагент_Key": counterparty_key,
            "СуммаДокумента": amount,
            "Posted":         is_posted,
        }
        if contract_key:
            payload["ДоговорКонтрагента_Key"] = contract_key
        if items:
            payload["Товары"] = self._build_invoice_items(items)
        return self._post("Document_СчетНаОплатуПокупателю", payload)

    def _patch(self, entity: str, guid: str, payload: dict) -> bool:
        url = f"{self._base}/{entity}(guid'{guid}')"
        try:
            r = self._session.patch(url, json=payload, timeout=self._timeout)
            r.raise_for_status()
            return True
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code in (401, 403):
                raise PermissionError(f"1С: нет доступа ({e.response.status_code})") from e
            logger.error("1C PATCH %s → %s", url, e)
            raise
        except (ConnectionError, Timeout) as e:
            logger.error("1C network error: %s", e)
            raise

    @staticmethod
    def _fmt_date(d: date | datetime | str) -> str:
        if isinstance(d, (date, datetime)):
            return d.strftime("%Y-%m-%dT00:00:00")
        return d

    @staticmethod
    def _in_range(doc: dict, date_from: date | None, date_to: date | None) -> bool:
        """Check if document Date field falls within [date_from, date_to]."""
        raw = doc.get("Date") or doc.get("Дата")
        if not raw:
            return True  # keep docs with unknown date
        try:
            doc_date = datetime.fromisoformat(str(raw)[:19]).date()
        except ValueError:
            return True
        if date_from and doc_date < date_from:
            return False
        if date_to and doc_date > date_to:
            return False
        return True

    # ── public API ─────────────────────────────────────────────────────────────

    def get_invoices(
        self,
        date_from: date | datetime | str | None = None,
        date_to:   date | datetime | str | None = None,
        top: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Счета на оплату (СчетНаОплатуПокупателю).

        1C:Fresh OData не поддерживает $filter по Date, поэтому загружаем
        все документы ($top=N) и фильтруем по дате на стороне Python.
        $expand=Товары включает строки номенклатуры в каждом документе.
        """
        docs = self._get("Document_СчетНаОплатуПокупателю",
                         {"$top": top, "$format": "json"})
        df = date_from.date() if isinstance(date_from, datetime) else (date_from if isinstance(date_from, date) else None)
        dt = date_to.date()   if isinstance(date_to,   datetime) else (date_to   if isinstance(date_to,   date) else None)
        return [d for d in docs if self._in_range(d, df, dt)]

    def get_sales(
        self,
        date_from: date | datetime | str | None = None,
        date_to:   date | datetime | str | None = None,
        top: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Реализация товаров и услуг (РеализацияТоваровУслуг).
        """
        docs = self._get("Document_РеализацияТоваровУслуг",
                         {"$top": top, "$format": "json"})
        df = date_from.date() if isinstance(date_from, datetime) else (date_from if isinstance(date_from, date) else None)
        dt = date_to.date()   if isinstance(date_to,   datetime) else (date_to   if isinstance(date_to,   date) else None)
        return [d for d in docs if self._in_range(d, df, dt)]

    def get_nomenclature_catalog(self, top: int = 5000) -> list[dict[str, Any]]:
        """
        Справочник номенклатуры (Catalog_Номенклатура).
        Возвращает все позиции (не папки, не помеченные на удаление).
        """
        try:
            items = self._get("Catalog_Номенклатура",
                              {"$top": top, "$format": "json", "$filter": "IsFolder eq false"})
            return [it for it in items if not it.get("DeletionMark", False)]
        except Exception as exc:
            logger.warning("get_nomenclature_catalog failed: %s", exc)
            return []

    _ZERO_GUID = "00000000-0000-0000-0000-000000000000"

    def get_organization_files(self) -> dict[str, dict[str, str] | None]:
        """Печать (ФайлПечать) и факсимиле подписи (ФайлФаксимильнаяПечать), если они
        загружены в саму организацию в 1С — Catalog_Организации.ФайлПечать_Key /
        ФайлФаксимильнаяПечать_Key ссылаются на Catalog_ОрганизацииПрисоединенныеФайлы,
        где сам файл лежит как ФайлХранилище_Base64Data.
        Returns {"seal": {"data_b64", "ext"} | None, "facsimile": {...} | None}.
        """
        result: dict[str, dict[str, str] | None] = {"seal": None, "facsimile": None}
        try:
            orgs = self._get("Catalog_Организации", {"$top": 1, "$format": "json"})
        except Exception as exc:
            logger.warning("get_organization_files: failed to list organizations: %s", exc)
            return result
        if not orgs:
            return result
        org = orgs[0]
        for out_key, field_key in (("seal", "ФайлПечать_Key"), ("facsimile", "ФайлФаксимильнаяПечать_Key")):
            guid = org.get(field_key)
            if not guid or guid == self._ZERO_GUID:
                continue
            file_doc = self.get_document(guid, "Catalog_ОрганизацииПрисоединенныеФайлы")
            data_b64 = file_doc.get("ФайлХранилище_Base64Data") if file_doc else None
            ext = (file_doc or {}).get("Расширение", "").lstrip(".").lower() or "png"
            if data_b64:
                result[out_key] = {"data_b64": data_b64, "ext": ext}
        return result

    def get_contractor(self, guid: str) -> tuple[str, str]:
        """Returns (name, inn) for a contractor GUID. Empty strings on failure."""
        url = f"{self._base}/Catalog_Контрагенты(guid'{guid}')?$format=json"
        try:
            req  = requests.Request("GET", url)
            prep = self._session.prepare_request(req)
            prep.url = url
            r = self._session.send(prep, timeout=10, verify=True)
            if r.ok:
                data = r.json()
                name = data.get("Description") or data.get("Наименование", "")
                inn  = data.get("ИНН", "")
                return name, inn
        except Exception as exc:
            logger.debug("contractor lookup %s failed: %s", guid, exc)
        return "", ""

    def post_document(self, guid: str, entity: str = "Document_СчетНаОплатуПокупателю") -> bool:
        """Провести документ в 1С через OData action Post."""
        url = f"{self._base}/{entity}(guid'{guid}')/Post"
        try:
            req  = requests.Request("POST", url, json={"PostingModeOperational": False})
            prep = self._session.prepare_request(req)
            prep.url = url
            r = self._session.send(prep, timeout=self._timeout, verify=True)
            r.raise_for_status()
            logger.info("1C Post action OK: %s", guid)
            return True
        except requests.HTTPError as e:
            logger.error("1C Post action %s → %s %s", url, e, getattr(e.response, "text", "")[:200])
            raise

    def ping(self) -> bool:
        """Quick connectivity check — fetches up to 1 document."""
        url = f"{self._base}/Document_СчетНаОплатуПокупателю?$top=1&$format=json"
        req  = requests.Request("GET", url)
        prep = self._session.prepare_request(req)
        prep.url = url
        r = self._session.send(prep, timeout=10, verify=True)
        r.raise_for_status()
        return True

    def update_status(self, guid: str, status: str, entity: str = "Document_СчетНаОплатуПокупателю") -> bool:
        """Обновляет реквизит «СтатусОплаты» у документа по GUID."""
        return self._patch(entity, guid, {"СтатусОплаты": status})

    def get_contracts(
        self,
        counterparty_key: str | None = None,
        top: int = 500,
    ) -> list[dict[str, Any]]:
        """Договоры контрагентов (Catalog_ДоговорыКонтрагентов)."""
        params = {"$top": top, "$format": "json", "$filter": "IsFolder eq false"}
        docs = self._get("Catalog_ДоговорыКонтрагентов", params)
        if counterparty_key:
            docs = [d for d in docs if d.get("Owner_Key") == counterparty_key or d.get("Контрагент_Key") == counterparty_key]
        return [d for d in docs if not d.get("DeletionMark", False)]

    def get_contract_fields(self, ref_key: str) -> dict[str, Any] | None:
        """Получить один договор со всеми полями."""
        return self.get_document(ref_key, "Catalog_ДоговорыКонтрагентов")

    def get_document(self, guid: str, entity: str = "Document_СчетНаОплатуПокупателю") -> dict[str, Any] | None:
        """Получить один документ по GUID."""
        url = f"{self._base}/{entity}(guid'{guid}')?$format=json"
        try:
            req  = requests.Request("GET", url)
            prep = self._session.prepare_request(req)
            prep.url = url
            r = self._session.send(prep, timeout=self._timeout, verify=True)
            r.raise_for_status()
            return r.json()
        except requests.HTTPError:
            return None

    # Ставки НДС, которые 1С принимает напрямую в поле СтавкаНДС строк документа.
    # Всё остальное (например "Общая") — значение из справочника, которое
    # 1С должен подставить сам из Номенклатуры_Key.
    _DIRECT_VAT_RATES = frozenset({
        "БезНДС", "НДС0",
        "НДС10", "НДС10_110",
        "НДС18", "НДС18_118",
        "НДС20", "НДС20_120",
        "НДС22", "НДС22_122",
    })

    @staticmethod
    def _vat_for_row(vat_raw: str, has_nom_key: bool) -> str | None:
        """Вернуть ставку НДС для строки, или None — тогда поле не передаём в 1С.
        Если есть ключ номенклатуры — всегда пропускаем, 1С заполнит из каталога."""
        if has_nom_key:
            return None
        v = str(vat_raw or "").strip()
        if v in OneCODataClient._DIRECT_VAT_RATES:
            return v
        return "БезНДС"

    @staticmethod
    def _build_invoice_items(raw_items: list[dict]) -> list[dict]:
        """Строки Товары для СчетНаОплатуПокупателю / СчетФактура."""
        result = []
        for i, item in enumerate(raw_items, start=1):
            qty   = float(item.get("Количество", item.get("qty", 1)) or 1)
            price = float(item.get("Цена",       item.get("price", 0)) or 0)
            summa = float(item.get("Сумма",      item.get("amount", qty * price)) or qty * price)
            nom_key = item.get("Номенклатура_Key")
            row: dict = {
                "LineNumber": str(i),
                "Содержание": str(item.get("Содержание", item.get("description", "")) or ""),
                "Количество": qty,
                "Цена":       price,
                "Сумма":      summa,
            }
            # Когда есть Номенклатура_Key — не передаём НДС, 1С заполнит из справочника
            if not nom_key:
                row["СуммаНДС"] = float(item.get("СуммаНДС", 0) or 0)
            vat = OneCODataClient._vat_for_row(
                item.get("СтавкаНДС", item.get("vat", "")), bool(nom_key)
            )
            if vat is not None:
                row["СтавкаНДС"] = vat
            if nom_key:
                row["Номенклатура"]      = nom_key
                row["Номенклатура_Type"] = "StandardODATA.Catalog_Номенклатура"
            result.append(row)
        return result

    @staticmethod
    def _build_sale_items(raw_items: list[dict], invoice_ref: str = "") -> list[dict]:
        """Строки Товары для РеализацияТоваровУслуг (нет поля Содержание)."""
        result = []
        for i, item in enumerate(raw_items, start=1):
            qty   = float(item.get("Количество", item.get("qty", 1)) or 1)
            price = float(item.get("Цена",       item.get("price", 0)) or 0)
            summa = float(item.get("Сумма",      item.get("amount", qty * price)) or qty * price)
            nom_key = item.get("Номенклатура_Key")
            row: dict = {
                "LineNumber": str(i),
                "Количество": qty,
                "Цена":       price,
                "Сумма":      summa,
            }
            # Когда есть Номенклатура_Key — не передаём НДС, 1С заполнит из справочника
            if not nom_key:
                row["СуммаНДС"] = float(item.get("СуммаНДС", 0) or 0)
            vat = OneCODataClient._vat_for_row(
                item.get("СтавкаНДС", item.get("vat", "")), bool(nom_key)
            )
            if vat is not None:
                row["СтавкаНДС"] = vat
            if nom_key:
                row["Номенклатура_Key"] = nom_key
            if invoice_ref:
                row["СчетНаОплатуПокупателю_Key"] = invoice_ref
            result.append(row)
        return result

    # keep old name for any external callers
    _build_items = _build_invoice_items

    def create_sale_from_invoice(
        self,
        invoice_ref: str,
        is_posted: bool = False,
        override_items: list[dict] | None = None,
        contract_key: str | None = None,
    ) -> dict:
        """Создать РеализацияТоваровУслуг на основании счёта на оплату."""
        invoice = self.get_document(invoice_ref, "Document_СчетНаОплатуПокупателю")
        if not invoice:
            raise ValueError(f"Invoice not found in 1C: {invoice_ref}")
        raw_items = override_items or invoice.get("Товары") or []
        payload: dict = {
            "Date":                        datetime.now(_MOSCOW).strftime("%Y-%m-%dT%H:%M:%S"),
            "Контрагент_Key":              invoice.get("Контрагент_Key", ""),
            "СуммаДокумента":              invoice.get("СуммаДокумента", 0),
            "Posted":                      is_posted,
            "СчетНаОплатуПокупателю_Key":  invoice_ref,
            "ДокументОснование_Key":       invoice_ref,
            "ДокументОснование_Type":      "StandardODATA.Document_СчетНаОплатуПокупателю",
        }
        # Договор: явный параметр > унаследованный из счёта
        _contract = contract_key
        if not _contract:
            inv_contract = invoice.get("ДоговорКонтрагента_Key", "")
            if inv_contract and inv_contract != "00000000-0000-0000-0000-000000000000":
                _contract = inv_contract
        if _contract:
            payload["ДоговорКонтрагента_Key"] = _contract
        if invoice.get("Организация_Key"):
            payload["Организация_Key"] = invoice["Организация_Key"]
        if raw_items:
            payload["Товары"] = self._build_sale_items(raw_items, invoice_ref)
        return self._post("Document_РеализацияТоваровУслуг", payload)

    def create_factura_from_invoice(
        self,
        source_ref: str,
        is_posted: bool = False,
        source_entity: str = "Document_РеализацияТоваровУслуг",
        override_items: list[dict] | None = None,
        contract_key: str | None = None,
    ) -> dict:
        """Создать СчетФактураВыданный на основании реализации или счёта."""
        source = self.get_document(source_ref, source_entity)
        if not source:
            raise ValueError(f"Source document not found in 1C: {source_ref}")
        raw_items = override_items or source.get("Товары") or []
        payload: dict = {
            "Date":                   datetime.now(_MOSCOW).strftime("%Y-%m-%dT%H:%M:%S"),
            "Контрагент_Key":         source.get("Контрагент_Key", ""),
            "СуммаДокумента":         source.get("СуммаДокумента", 0),
            "ВидСчетФактуры":         "НаРеализацию",
            "Posted":                 is_posted,
            "ДокументОснование_Key":  source_ref,
            "ДокументОснование_Type": f"StandardODATA.{source_entity}",
        }
        _contract = contract_key
        if not _contract:
            src_contract = source.get("ДоговорКонтрагента_Key", "")
            if src_contract and src_contract != "00000000-0000-0000-0000-000000000000":
                _contract = src_contract
        if _contract:
            payload["ДоговорКонтрагента_Key"] = _contract
        if source.get("Организация_Key"):
            payload["Организация_Key"] = source["Организация_Key"]
        if raw_items:
            payload["Товары"] = self._build_invoice_items(raw_items)
        return self._post("Document_СчетФактураВыданный", payload)
