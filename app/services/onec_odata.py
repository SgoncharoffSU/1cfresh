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
    ) -> dict:
        """
        Create СчетНаОплатуПокупателю in 1C without a number (1C auto-assigns it).
        Returns the created document dict with Ref_Key, Number, Date.
        is_posted=True means the document is posted (проведен) in 1C.
        """
        payload: dict = {
            "Date":             datetime.now(_MOSCOW).strftime("%Y-%m-%dT%H:%M:%S"),
            "Контрагент_Key":   counterparty_key,
            "СуммаДокумента":   amount,
            "Posted":           is_posted,
        }
        # Replay the original line items if available
        if items:
            clean = []
            for i, item in enumerate(items, start=1):
                row: dict = {"LineNumber": str(i)}
                for key in ("Номенклатура_Key", "Количество", "Цена", "Сумма",
                            "СтавкаНДС", "СуммаНДС", "Содержание"):
                    if key in item:
                        row[key] = item[key]
                clean.append(row)
            payload["Товары"] = clean
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
        """
        docs = self._get("Document_СчетНаОплатуПокупателю", {"$top": top, "$format": "json"})
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
        docs = self._get("Document_РеализацияТоваровУслуг", {"$top": top, "$format": "json"})
        df = date_from.date() if isinstance(date_from, datetime) else (date_from if isinstance(date_from, date) else None)
        dt = date_to.date()   if isinstance(date_to,   datetime) else (date_to   if isinstance(date_to,   date) else None)
        return [d for d in docs if self._in_range(d, df, dt)]

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
