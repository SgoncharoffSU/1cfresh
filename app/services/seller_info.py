"""Resolves seller (our own organization) requisites live from 1C for a specific
document — name/ИНН/ОГРН/КПП, bank account, director. Shared by every
self-rendered print form (invoice, Счёт-фактура, УПД) that needs to print who's
actually getting paid, not just the buyer/counterparty.

1C document entities (Document_СчетНаОплатуПокупателю, Document_РеализацияТоваровУслуг)
carry Организация_Key/Руководитель_Key/БанковскийСчетОрганизации_Key directly, one
hop further to Catalog_Организации/Catalog_ФизическиеЛица/Catalog_БанковскиеСчета/
Catalog_Банки. Never raises — any lookup failure just leaves fields blank so the
calling form still renders.
"""
from __future__ import annotations

import asyncio
import logging

from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

_ZERO_GUID = "00000000-0000-0000-0000-000000000000"

EMPTY_SELLER = {
    "name": "", "inn": "", "kpp": "", "ogrn": "", "director_name": "",
    "bank_account": "", "bank_name": "", "bank_corr_account": "", "bank_bik": "",
    "without_vat": False,
}


async def resolve_seller(tenant: Tenant, ref_key: str, entity: str) -> dict:
    """`entity` is the document's own 1C entity name (e.g.
    "Document_СчетНаОплатуПокупателю" or "Document_РеализацияТоваровУслуг")."""
    if not (tenant and tenant.odata_login and tenant.odata_url):
        return dict(EMPTY_SELLER)

    result = dict(EMPTY_SELLER)
    try:
        from app.services.onec_odata import OneCODataClient
        client = OneCODataClient(login=tenant.odata_login, password=tenant.odata_password, base_url=tenant.odata_url)
        loop = asyncio.get_running_loop()

        full_doc = await loop.run_in_executor(None, client.get_document, ref_key, entity)
        if not full_doc:
            return result
        result["without_vat"] = bool(full_doc.get("ДокументБезНДС"))

        org_key = full_doc.get("Организация_Key")
        director_key = full_doc.get("Руководитель_Key")
        bank_account_key = full_doc.get("БанковскийСчетОрганизации_Key")

        if org_key and org_key != _ZERO_GUID:
            org = await loop.run_in_executor(None, client.get_document, org_key, "Catalog_Организации")
            if org:
                result["name"] = org.get("НаименованиеПолное") or org.get("НаименованиеСокращенное") or ""
                result["inn"] = org.get("ИНН") or ""
                result["kpp"] = org.get("КПП") or ""
                result["ogrn"] = org.get("ОГРН") or ""
                if not bank_account_key or bank_account_key == _ZERO_GUID:
                    bank_account_key = org.get("ОсновнойБанковскийСчет_Key")

        if director_key and director_key != _ZERO_GUID:
            person = await loop.run_in_executor(None, client.get_document, director_key, "Catalog_ФизическиеЛица")
            if person:
                result["director_name"] = person.get("Description") or ""

        if bank_account_key and bank_account_key != _ZERO_GUID:
            acc = await loop.run_in_executor(None, client.get_document, bank_account_key, "Catalog_БанковскиеСчета")
            if acc:
                result["bank_account"] = acc.get("НомерСчета") or ""
                bank_key = acc.get("Банк_Key")
                if bank_key and bank_key != _ZERO_GUID:
                    bank = await loop.run_in_executor(None, client.get_document, bank_key, "Catalog_Банки")
                    if bank:
                        result["bank_name"] = bank.get("Description") or ""
                        result["bank_corr_account"] = bank.get("КоррСчет") or ""
                        result["bank_bik"] = bank.get("Code") or ""
    except Exception as exc:
        logger.warning("seller_info: resolution failed for %s (%s): %s", ref_key, entity, exc)
    return result
