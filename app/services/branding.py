"""Renders a client's letterhead branding (logo, organization stamp+signature,
custom text) into HTML snippets ready to embed in the self-generated print forms
(app/api/print_form.py, app/api/act_forms.py).

Absolute URLs (via API_EXTERNAL_URL) are used for the images rather than relative
`/uploads/...` paths: the KS-2/KS-3 forms are fetched as text by the frontend and
opened via `URL.createObjectURL()` (a blob: URL with no real origin to resolve a
relative path against), so a relative `src` would silently fail to load there.
"""
import html
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.client_branding import ClientBranding

_LOGO_ALIGN = {"top-left": "left", "top-center": "center", "top-right": "right"}

_EMPTY = {"logo_html": "", "stamp_html": "", "text_header_html": "", "text_footer_html": ""}


def _asset_url(rel_path: str) -> str:
    return f"{settings.API_EXTERNAL_URL.rstrip('/')}/uploads/{rel_path}"


async def load_branding_html(db: AsyncSession, client_id: Optional[str]) -> dict:
    """Returns {logo_html, stamp_html, text_header_html, text_footer_html} — all
    empty strings when the client has no branding configured (or client_id is
    None, e.g. a legacy firm-wide tenant with no per-client branding)."""
    if not client_id:
        return dict(_EMPTY)

    branding = await db.get(ClientBranding, client_id)
    if not branding:
        return dict(_EMPTY)

    logo_html = ""
    if branding.logo_path:
        align = _LOGO_ALIGN.get(branding.logo_position, "left")
        logo_html = (
            f'<div class="branding-logo" style="text-align:{align}">'
            f'<img src="{_asset_url(branding.logo_path)}" alt="Логотип"></div>'
        )

    stamp_html = ""
    if branding.stamp_path:
        # Manually uploaded, already-combined seal+signature scan — takes priority.
        stamp_html = (
            f'<div class="branding-stamp"><img src="{_asset_url(branding.stamp_path)}" '
            f'alt="Печать" style="height:90px"></div>'
        )
    elif branding.seal_path or branding.facsimile_path:
        # Imported separately from 1C (Catalog_Организации.ФайлПечать/ФайлФаксимильнаяПечать)
        # — rendered together, overlapping, the same way a real seal is stamped over a signature.
        imgs = ""
        if branding.seal_path:
            imgs += f'<img src="{_asset_url(branding.seal_path)}" alt="Печать" style="height:90px">'
        if branding.facsimile_path:
            imgs += (
                f'<img src="{_asset_url(branding.facsimile_path)}" alt="Факсимиле подписи" '
                f'style="height:50px;margin-left:-20px">'
            )
        stamp_html = f'<div class="branding-stamp">{imgs}</div>'

    text_header_html = text_footer_html = ""
    if branding.custom_text:
        text_html = f'<div class="branding-text">{html.escape(branding.custom_text)}</div>'
        if branding.text_position == "header":
            text_header_html = text_html
        else:
            text_footer_html = text_html

    return {
        "logo_html": logo_html,
        "stamp_html": stamp_html,
        "text_header_html": text_header_html,
        "text_footer_html": text_footer_html,
    }
