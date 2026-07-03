"""Client contacts and channel bindings — shared across devices for one tenant."""
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_tenant, get_current_user
from app.db.database import get_db
from app.models.chat_message import ChatMessage
from app.models.client_channel import ClientChannel
from app.models.client_contact import ClientContact
from app.models.firm import User
from app.models.tenant import Tenant
from app.services.abonent_service import next_abonent_number
from app.services.auth_service import hash_password

router = APIRouter(prefix="/clients", tags=["clients"])

_DEFAULT_CLIENT_COLOR = "bg-blue-100 text-blue-700"


def _initials_from_name(name: str) -> str:
    words = name.strip().split()
    return "".join(w[0] for w in words[:2]).upper() or "??"


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


class OnecConnectIn(BaseModel):
    client_id:      Optional[str] = None   # None → create a new client along with the connection
    name:           Optional[str] = None   # required when client_id is None
    shortName:      Optional[str] = None
    inn:            Optional[str] = None
    initials:       Optional[str] = None
    color:          Optional[str] = None
    odata_url:      str
    odata_login:    str
    odata_password: str


class OnecConnectOut(BaseModel):
    ok:        bool
    client_id: str
    connected: bool


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


@router.post("/onec-connect", response_model=OnecConnectOut)
async def connect_onec(
    data: OnecConnectIn,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Attach a client's own 1C:Fresh OData connection — creating the client first when
    client_id is omitted. Each client now has their own 1C base, so this is the normal
    way most clients get added (see IntegrationsTab's "1С" row for the reconnect path)."""
    if data.client_id:
        client = await db.get(ClientContact, data.client_id)
        if not client or client.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Client not found")
    else:
        name = (data.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Укажите название клиента")
        abonent_number = await next_abonent_number(db, tenant_id)
        client = ClientContact(
            id             = str(uuid4()),
            tenant_id      = tenant_id,
            abonent_number = abonent_number,
            name           = name,
            short_name     = (data.shortName or name)[:200],
            inn            = data.inn,
            initials       = data.initials or _initials_from_name(name),
            color          = data.color or _DEFAULT_CLIENT_COLOR,
        )
        db.add(client)
        await db.flush()

    # Test the connection before saving (same pattern as PUT /auth/tenant).
    connected = False
    try:
        from app.services.onec_odata import OneCODataClient
        odata = OneCODataClient(
            login    = data.odata_login,
            password = data.odata_password,
            base_url = data.odata_url,
        )
        odata.ping()
        connected = True
    except Exception:
        pass

    res = await db.execute(select(Tenant).where(Tenant.client_contact_id == client.id))
    onec_tenant = res.scalar_one_or_none()
    if onec_tenant is None:
        onec_tenant = Tenant(
            firm_id            = user.firm_id,
            client_contact_id  = client.id,
            name               = client.name,
            odata_url          = data.odata_url,
            odata_login        = data.odata_login,
            odata_password     = data.odata_password,
            is_active          = connected,
        )
        db.add(onec_tenant)
    else:
        onec_tenant.odata_url      = data.odata_url
        onec_tenant.odata_login    = data.odata_login
        onec_tenant.odata_password = data.odata_password
        onec_tenant.is_active      = connected

    await db.flush()

    # Tag the "1C" channel so the existing activeChannels/channelIds badge logic in
    # ClientsList/IntegrationsTab picks this up with no frontend response-shape change.
    ch_res = await db.execute(
        select(ClientChannel).where(
            ClientChannel.tenant_id == tenant_id,
            ClientChannel.client_id == client.id,
            ClientChannel.channel   == "1C",
        )
    )
    channel = ch_res.scalar_one_or_none()
    if channel:
        channel.channel_ref = str(onec_tenant.id)
    else:
        db.add(ClientChannel(tenant_id=tenant_id, client_id=client.id, channel="1C", channel_ref=str(onec_tenant.id)))

    await db.commit()
    return OnecConnectOut(ok=True, client_id=client.id, connected=connected)


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
