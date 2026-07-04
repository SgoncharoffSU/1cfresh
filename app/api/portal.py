"""Client portal (tier 3 — "abonent"): credentials, chat, and documents.

Abonent identity/scope always comes from a `typ=abonent` JWT (issued by `/portal/{firm_id}/login`),
never from a client-supplied tenant_id/client_id — see get_current_abonent(). The one caller that
legitimately acts on behalf of the firm rather than the abonent (Telegram-mirror) uses the
tier-2 `/portal/chat/mirror` endpoint instead, authenticated via the accountant's own JWT.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _first_tenant_id, get_current_tenant, get_current_user
from app.db.database import get_db
from app.models.client_contact import ClientContact
from app.models.firm import User
from app.models.portal_credential import PortalCredential
from app.models.portal_message import PortalMessage
from app.models.tenant import OneCDocument, Tenant
from app.services.activity_log import log_activity
from app.services.auth_service import create_token, decode_token, hash_password, verify_password

router  = APIRouter(prefix="/portal", tags=["portal"])
_bearer = HTTPBearer(auto_error=False)


# ─── Abonent auth (tier 3) ─────────────────────────────────────────────────────

async def get_current_abonent(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db:    AsyncSession = Depends(get_db),
) -> ClientContact:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not creds:
        raise exc
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise exc
    if payload.get("typ") != "abonent":
        raise exc
    contact = await db.get(ClientContact, payload.get("sub"))
    if not contact:
        raise exc
    return contact


# ─── Credentials (set by the accountant, tier 2) ───────────────────────────────

class SetCredentialsPayload(BaseModel):
    client_id:   str
    client_name: Optional[str] = None
    login:       str
    password:    str


class PortalLoginPayload(BaseModel):
    login:    str
    password: str


@router.post("/set-credentials")
async def set_credentials(
    data: SetCredentialsPayload,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not data.login.strip() or not data.password.strip():
        raise HTTPException(status_code=400, detail="Login and password are required")

    result = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == tenant_id,
            PortalCredential.client_id == data.client_id,
        )
    )
    cred = result.scalar_one_or_none()
    pw_hash = hash_password(data.password.strip())

    if cred:
        cred.login         = data.login.strip().lower()
        cred.password_hash = pw_hash
        if data.client_name:
            cred.client_name = data.client_name
    else:
        dup = await db.execute(
            select(PortalCredential).where(
                PortalCredential.tenant_id == tenant_id,
                PortalCredential.login     == data.login.strip().lower(),
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Этот логин уже занят")
        cred = PortalCredential(
            tenant_id     = tenant_id,
            client_id     = data.client_id,
            client_name   = data.client_name or data.client_id,
            login         = data.login.strip().lower(),
            password_hash = pw_hash,
        )
        db.add(cred)

    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="portal.set_credentials",
                        description=f"Настроены учётные данные портала (логин: {cred.login}) для клиента {data.client_id}",
                        entity_type="client", entity_id=data.client_id)
    await db.commit()
    await db.refresh(cred)
    return {"ok": True, "login": cred.login, "client_id": cred.client_id}


@router.post("/{firm_id}/login")
async def portal_login(firm_id: int, data: PortalLoginPayload, db: AsyncSession = Depends(get_db)):
    """Abonent login, scoped by firm_id from the URL — never a client-supplied tenant_id."""
    tenant_id = await _first_tenant_id(db, firm_id)
    if tenant_id is None:
        raise HTTPException(status_code=404, detail="Firm not found")

    result = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == tenant_id,
            PortalCredential.login     == data.login.strip().lower(),
        )
    )
    cred = result.scalar_one_or_none()
    if not cred or not verify_password(data.password, cred.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    contact = await db.get(ClientContact, cred.client_id)
    abonent_number = contact.abonent_number if contact else None
    if abonent_number is None:
        raise HTTPException(status_code=409, detail="Личный кабинет ещё не настроен — обратитесь к бухгалтеру")

    token = create_token({
        "sub":            cred.client_id,
        "tenant_id":      tenant_id,
        "firm_id":        firm_id,
        "abonent_number": abonent_number,
        "typ":            "abonent",
    })
    return {
        "access_token":   token,
        "client_id":      cred.client_id,
        "client_name":    cred.client_name,
        "firm_id":        firm_id,
        "abonent_number": abonent_number,
    }


@router.get("/credentials")
async def get_credentials(
    tenant_id: int = Depends(get_current_tenant),
    client_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == tenant_id,
            PortalCredential.client_id == client_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return {"exists": False, "login": None}
    return {"exists": True, "login": cred.login, "client_id": cred.client_id}


# ─── Chat ─────────────────────────────────────────────────────────────────────

class PortalChatSendPayload(BaseModel):
    text:   str
    source: str = 'portal'


class PortalChatMirrorPayload(BaseModel):
    """Tier-2 only: mirrors an inbound message (e.g. Telegram) into a client's portal thread."""
    portal_client_id: str
    text:             str
    source:           str = 'tg'


class PortalChatReplyPayload(BaseModel):
    portal_client_id: str
    text:             str
    sender_name:      str = "Бухгалтер"


def _msg_dict(m: PortalMessage) -> dict:
    return {
        "id":               m.id,
        "portal_client_id": m.portal_client_id,
        "client_name":      m.client_name,
        "text":             m.text,
        "direction":        m.direction,
        "sender_name":      m.sender_name,
        "timestamp":        m.timestamp.isoformat() + "Z",
        "is_read":          m.is_read,
    }


@router.post("/chat/send")
async def portal_chat_send(
    data: PortalChatSendPayload,
    abonent: ClientContact = Depends(get_current_abonent),
    db: AsyncSession = Depends(get_db),
):
    """Abonent sends a message to the accountant — scope comes from their own JWT."""
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    msg = PortalMessage(
        tenant_id        = abonent.tenant_id,
        portal_client_id = abonent.id,
        client_name      = abonent.name,
        text             = data.text.strip(),
        direction        = "inbound",
        sender_name      = abonent.name,
        source           = data.source,
        timestamp        = datetime.utcnow(),
        is_read          = False,
    )
    db.add(msg)
    firm_row = await db.execute(select(Tenant.firm_id).where(Tenant.id == abonent.tenant_id))
    await log_activity(db, actor_type="abonent", actor_name=abonent.name,
                        firm_id=firm_row.scalar_one_or_none(), action="portal.chat_send",
                        description=f"Сообщение от клиента «{abonent.name}» через портал",
                        entity_type="client", entity_id=abonent.id)
    await db.commit()
    await db.refresh(msg)
    return {"ok": True, "id": msg.id}


@router.post("/chat/mirror")
async def portal_chat_mirror(
    data: PortalChatMirrorPayload,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accountant-side mirror of an inbound message from another channel (e.g. Telegram)."""
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    cred_res = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == tenant_id,
            PortalCredential.client_id == data.portal_client_id,
        )
    )
    cred = cred_res.scalar_one_or_none()
    client_name = cred.client_name if cred else data.portal_client_id

    msg = PortalMessage(
        tenant_id        = tenant_id,
        portal_client_id = data.portal_client_id,
        client_name      = client_name,
        text             = data.text.strip(),
        direction        = "inbound",
        sender_name      = client_name,
        source           = data.source,
        timestamp        = datetime.utcnow(),
        is_read          = False,
    )
    db.add(msg)
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="portal.chat_mirror",
                        description=f"Отзеркалено сообщение клиенту «{client_name}» ({data.source})",
                        entity_type="client", entity_id=data.portal_client_id)
    await db.commit()
    await db.refresh(msg)
    return {"ok": True, "id": msg.id}


@router.post("/chat/reply")
async def portal_chat_reply(
    data: PortalChatReplyPayload,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accountant sends a reply visible on the portal."""
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    msg = PortalMessage(
        tenant_id        = tenant_id,
        portal_client_id = data.portal_client_id,
        client_name      = None,
        text             = data.text.strip(),
        direction        = "outbound",
        sender_name      = data.sender_name,
        timestamp        = datetime.utcnow(),
        is_read          = True,
    )
    db.add(msg)
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="portal.chat_reply",
                        description=f"Ответ клиенту через портал ({data.portal_client_id})",
                        entity_type="client", entity_id=data.portal_client_id)
    await db.commit()
    await db.refresh(msg)
    return {"ok": True, "id": msg.id}


@router.get("/chat/inbox")
async def portal_chat_inbox(
    tenant_id: int = Depends(get_current_tenant),
    since_id:  int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """Accountant polls for new portal messages (all clients, inbound only)."""
    result = await db.execute(
        select(PortalMessage)
        .where(
            PortalMessage.tenant_id == tenant_id,
            PortalMessage.id        >  since_id,
            PortalMessage.direction == "inbound",
            PortalMessage.source    == "portal",  # skip TG mirrors — already in CRM
        )
        .order_by(PortalMessage.timestamp)
    )
    return {"messages": [_msg_dict(m) for m in result.scalars().all()]}


@router.get("/chat/history")
async def portal_chat_history(
    abonent: ClientContact = Depends(get_current_abonent),
    db: AsyncSession = Depends(get_db),
):
    """Abonent's own full chat history — scope comes from their own JWT."""
    result = await db.execute(
        select(PortalMessage)
        .where(
            PortalMessage.tenant_id        == abonent.tenant_id,
            PortalMessage.portal_client_id == abonent.id,
        )
        .order_by(PortalMessage.timestamp)
    )
    return {"messages": [_msg_dict(m) for m in result.scalars().all()]}


# ─── Documents ────────────────────────────────────────────────────────────────

@router.get("/documents")
async def portal_documents(
    abonent: ClientContact = Depends(get_current_abonent),
    db: AsyncSession = Depends(get_db),
):
    """Documents for the authenticated abonent, matched by counterparty name."""
    cred_res = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == abonent.tenant_id,
            PortalCredential.client_id == abonent.id,
        )
    )
    cred = cred_res.scalar_one_or_none()
    if not cred or not cred.client_name:
        return {"documents": []}

    search = f"%{cred.client_name.lower()}%"
    result = await db.execute(
        select(OneCDocument)
        .where(
            OneCDocument.tenant_id == abonent.tenant_id,
            func.lower(OneCDocument.counterparty_name).like(search),
            OneCDocument.deletion_mark == False,  # noqa: E712
        )
        .order_by(OneCDocument.date.desc())
        .limit(100)
    )
    docs = result.scalars().all()
    return {
        "documents": [
            {
                "ref_key":   d.ref_key,
                "number":    d.number or "—",
                "doc_type":  d.doc_type,
                "date":      d.date.isoformat() if d.date else None,
                "amount":    float(d.amount or 0),
                "is_posted": d.is_posted,
            }
            for d in docs
        ]
    }
