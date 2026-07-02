"""Client contacts and channel bindings — shared across devices for one tenant."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_tenant
from app.db.database import get_db
from app.models.chat_message import ChatMessage
from app.models.client_channel import ClientChannel
from app.models.client_contact import ClientContact
from app.services.abonent_service import next_abonent_number
from app.services.auth_service import hash_password

router = APIRouter(prefix="/clients", tags=["clients"])


# ─── Payloads ──────────────────────────────────────────────────────────────────

class ClientIn(BaseModel):
    id:              str
    name:            str
    shortName:       str
    inn:             Optional[str] = None
    initials:        str
    color:           str
    activeChannels:  list[str] = []
    channelIds:      dict[str, str] = {}
    portalLogin:     Optional[str] = None
    portalPassword:  Optional[str] = None


class ChannelIn(BaseModel):
    channelRef: str


class PortalCredentialsIn(BaseModel):
    login:    str
    password: str


class MergeIn(BaseModel):
    keepId:   str
    removeId: str


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _client_dict(db: AsyncSession, tenant_id: int, c: ClientContact) -> dict:
    res = await db.execute(
        select(ClientChannel).where(
            ClientChannel.tenant_id == tenant_id,
            ClientChannel.client_id == c.id,
        )
    )
    channels = res.scalars().all()
    return {
        "id":             c.id,
        "name":           c.name,
        "shortName":      c.short_name,
        "inn":            c.inn,
        "initials":       c.initials,
        "color":          c.color,
        "activeChannels": [ch.channel for ch in channels],
        "channelIds":     {ch.channel: ch.channel_ref for ch in channels},
        "portalLogin":    c.portal_login,
        "abonentNumber":  c.abonent_number,
    }


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_clients(
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(ClientContact).where(ClientContact.tenant_id == tenant_id))
    clients = res.scalars().all()
    return {"clients": [await _client_dict(db, tenant_id, c) for c in clients]}


@router.post("/")
async def create_client(
    data: ClientIn,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent by id — frontend already generated id/color locally."""
    existing = await db.get(ClientContact, data.id)
    if existing:
        return {"ok": True, "id": existing.id}

    abonent_number = await next_abonent_number(db, tenant_id)

    client = ClientContact(
        id             = data.id,
        tenant_id      = tenant_id,
        abonent_number = abonent_number,
        name           = data.name,
        short_name     = data.shortName,
        inn            = data.inn,
        initials       = data.initials,
        color          = data.color,
        portal_login          = data.portalLogin,
        portal_password_hash  = hash_password(data.portalPassword) if data.portalPassword else None,
    )
    db.add(client)
    await db.flush()

    for ch, ref in data.channelIds.items():
        db.add(ClientChannel(tenant_id=tenant_id, client_id=client.id, channel=ch, channel_ref=str(ref)))

    await db.commit()
    return {"ok": True, "id": client.id}


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    client = await db.get(ClientContact, client_id)
    if not client or client.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)  # client_channels cascade; chat_messages.client_id -> NULL
    await db.commit()
    return {"ok": True}


@router.put("/{client_id}/channels/{channel}")
async def set_channel(
    client_id: str,
    channel:   str,
    data: ChannelIn,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    client = await db.get(ClientContact, client_id)
    if not client or client.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")

    res = await db.execute(
        select(ClientChannel).where(
            ClientChannel.tenant_id == tenant_id,
            ClientChannel.client_id == client_id,
            ClientChannel.channel   == channel,
        )
    )
    row = res.scalar_one_or_none()
    if row:
        row.channel_ref = data.channelRef
    else:
        db.add(ClientChannel(tenant_id=tenant_id, client_id=client_id, channel=channel, channel_ref=data.channelRef))
    await db.commit()
    return {"ok": True}


@router.put("/{client_id}/portal-credentials")
async def set_portal_credentials(
    client_id: str,
    data: PortalCredentialsIn,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    client = await db.get(ClientContact, client_id)
    if not client or client.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    client.portal_login         = data.login
    client.portal_password_hash = hash_password(data.password)
    await db.commit()
    return {"ok": True}


@router.post("/merge")
async def merge_clients(
    data: MergeIn,
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Move channel bindings and messages from removeId onto keepId, then drop removeId."""
    keep   = await db.get(ClientContact, data.keepId)
    remove = await db.get(ClientContact, data.removeId)
    if not keep or keep.tenant_id != tenant_id or not remove or remove.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")

    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.tenant_id == tenant_id, ChatMessage.client_id == data.removeId)
        .values(client_id=data.keepId)
    )

    res = await db.execute(
        select(ClientChannel).where(
            ClientChannel.tenant_id == tenant_id,
            ClientChannel.client_id == data.removeId,
        )
    )
    keep_channels = {
        ch.channel for ch in (await db.execute(
            select(ClientChannel).where(
                ClientChannel.tenant_id == tenant_id,
                ClientChannel.client_id == data.keepId,
            )
        )).scalars().all()
    }
    for ch in res.scalars().all():
        if ch.channel in keep_channels:
            await db.delete(ch)
        else:
            ch.client_id = data.keepId

    await db.delete(remove)
    await db.commit()
    return {"ok": True}
