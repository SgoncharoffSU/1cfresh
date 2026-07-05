"""Letterhead branding (logo, organization stamp+signature, custom text) for a
client's self-generated print forms — see app/api/print_form.py and app/api/act_forms.py
for where these get embedded."""
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_tenant, get_current_user
from app.config import settings
from app.db.database import get_db
from app.models.client_branding import ClientBranding
from app.models.client_contact import ClientContact
from app.models.firm import User
from app.services.activity_log import log_activity

router = APIRouter(prefix="/clients", tags=["branding"])

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
_MAX_BYTES = 2 * 1024 * 1024
_LOGO_POSITIONS = {"top-left", "top-center", "top-right"}
_TEXT_POSITIONS = {"header", "footer"}


def _out(branding: Optional[ClientBranding]) -> dict:
    def url(path: Optional[str]) -> Optional[str]:
        return f"/uploads/{path}" if path else None

    if not branding:
        return {
            "logo_url": None, "logo_position": "top-left",
            "stamp_url": None,
            "custom_text": "", "text_position": "footer",
        }
    return {
        "logo_url": url(branding.logo_path), "logo_position": branding.logo_position,
        "stamp_url": url(branding.stamp_path),
        "custom_text": branding.custom_text or "", "text_position": branding.text_position,
    }


async def _get_owned_client(db: AsyncSession, client_id: str, tenant_id: int) -> ClientContact:
    client = await db.get(ClientContact, client_id)
    if not client or client.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


async def _save_upload(file: UploadFile, client_id: str, kind: str) -> str:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Допустимы только изображения PNG/JPEG/WEBP")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="Файл слишком большой (максимум 2 МБ)")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[file.content_type]
    rel_dir = f"branding/{client_id}"
    (UPLOAD_DIR / rel_dir).mkdir(parents=True, exist_ok=True)
    rel_path = f"{rel_dir}/{kind}.{ext}"
    (UPLOAD_DIR / rel_path).write_bytes(data)
    return rel_path


@router.get("/{client_id}/branding")
async def get_branding(
    client_id: str,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_client(db, client_id, tenant_id)
    branding = await db.get(ClientBranding, client_id)
    return _out(branding)


@router.post("/{client_id}/branding")
async def save_branding(
    client_id: str,
    custom_text: str = Form(""),
    logo_position: str = Form("top-left"),
    text_position: str = Form("footer"),
    logo: Optional[UploadFile] = File(None),
    stamp: Optional[UploadFile] = File(None),
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_owned_client(db, client_id, tenant_id)
    if logo_position not in _LOGO_POSITIONS:
        raise HTTPException(status_code=400, detail="Некорректное положение логотипа")
    if text_position not in _TEXT_POSITIONS:
        raise HTTPException(status_code=400, detail="Некорректное положение текста")

    branding = await db.get(ClientBranding, client_id)
    if branding is None:
        branding = ClientBranding(client_id=client_id)
        db.add(branding)

    if logo is not None and logo.filename:
        branding.logo_path = await _save_upload(logo, client_id, "logo")
    if stamp is not None and stamp.filename:
        branding.stamp_path = await _save_upload(stamp, client_id, "stamp")
    branding.custom_text = custom_text
    branding.logo_position = logo_position
    branding.text_position = text_position

    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="client.branding_update",
                        description=f"Обновлено оформление печатных форм для клиента «{client.name}»",
                        entity_type="client", entity_id=client_id)
    await db.commit()
    return _out(branding)
