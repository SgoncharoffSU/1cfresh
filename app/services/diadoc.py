import base64
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DIADOC_URL = "https://diadoc-api.kontur.ru"


class DiadocService:
    def __init__(self) -> None:
        self.client_id = settings.DIADOC_API_CLIENT_ID
        self.from_box_id = settings.DIADOC_FROM_BOX_ID
        self._token: Optional[str] = None

    # ------------------------------------------------------------------ auth

    async def _ensure_token(self) -> str:
        if self._token:
            return self._token
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{DIADOC_URL}/V3/Authenticate",
                params={"type": "password"},
                json={"Login": settings.DIADOC_LOGIN, "Password": settings.DIADOC_PASSWORD},
                headers={
                    "Authorization": f"DiadocAuth ddauth_api_client_id={self.client_id}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )
            r.raise_for_status()
            self._token = r.text.strip('"')
            logger.info("Diadoc token obtained")
            return self._token

    def _auth(self, token: str) -> str:
        return f"DiadocAuth ddauth_api_client_id={self.client_id},ddauth_token={token}"

    # ------------------------------------------------------------------ public

    async def get_box_id_by_inn(self, inn: str) -> str:
        token = await self._ensure_token()
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f"{DIADOC_URL}/V3/GetOrganizationsByInnKpp",
                params={"inn": inn},
                headers={"Authorization": self._auth(token)},
                timeout=15.0,
            )
            r.raise_for_status()
            orgs = r.json().get("Organizations", [])
            if not orgs:
                raise ValueError(f"Diadoc: organization INN={inn} not found in network")
            return orgs[0]["Boxes"][0]["BoxId"]

    async def send_nonformalized(
        self,
        to_box_id: str,
        pdf_bytes: bytes,
        filename: str,
        comment: str,
        need_signature: bool = True,
    ) -> str:
        """Send PDF as non-formalized document. Returns MessageId."""
        token = await self._ensure_token()
        payload = {
            "FromBoxId": self.from_box_id,
            "ToBoxId": to_box_id,
            "DocumentAttachments": [
                {
                    "TypeNamedId": "Nonformalized",
                    "Function": "default",
                    "Version": "v1",
                    "Content": {"Content": base64.b64encode(pdf_bytes).decode(), "SignWithTestSignature": False},
                    "FileName": filename,
                    "NeedRecipientSignature": need_signature,
                    "IsEncrypted": False,
                    "Comment": comment,
                }
            ],
        }
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{DIADOC_URL}/V3/SendMessage",
                json=payload,
                headers={"Authorization": self._auth(token), "Content-Type": "application/json"},
                timeout=30.0,
            )
            r.raise_for_status()
            msg_id: str = r.json()["MessageId"]
            logger.info("Diadoc message sent id=%s", msg_id)
            return msg_id

    async def send_invoice(
        self,
        inn_or_box_id: str,
        pdf_bytes: bytes,
        number: str,
        date_str: str,
        amount: float,
    ) -> str:
        try:
            box_id = await self.get_box_id_by_inn(inn_or_box_id)
        except Exception:
            # If resolution fails treat as raw box_id
            box_id = inn_or_box_id

        fname = f"invoice_{number.replace('/', '_')}.pdf"
        comment = f"Счет на оплату №{number} от {date_str} на сумму {amount:,.2f} руб."
        return await self.send_nonformalized(box_id, pdf_bytes, fname, comment)


diadoc_service = DiadocService()
