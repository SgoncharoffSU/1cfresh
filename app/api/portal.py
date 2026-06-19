"""Client portal: credentials, chat, and documents."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.portal_credential import PortalCredential
from app.models.portal_message import PortalMessage
from app.models.tenant import OneCDocument
from app.services.auth_service import hash_password, verify_password

router = APIRouter(prefix="/portal", tags=["portal"])


# ─── Credentials ──────────────────────────────────────────────────────────────

class SetCredentialsPayload(BaseModel):
    tenant_id:   int = 1
    client_id:   str
    client_name: Optional[str] = None
    login:       str
    password:    str


class PortalLoginPayload(BaseModel):
    login:     str
    password:  str
    tenant_id: int = 1


@router.post("/set-credentials")
async def set_credentials(data: SetCredentialsPayload, db: AsyncSession = Depends(get_db)):
    if not data.login.strip() or not data.password.strip():
        raise HTTPException(status_code=400, detail="Login and password are required")

    result = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == data.tenant_id,
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
                PortalCredential.tenant_id == data.tenant_id,
                PortalCredential.login     == data.login.strip().lower(),
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Этот логин уже занят")
        cred = PortalCredential(
            tenant_id     = data.tenant_id,
            client_id     = data.client_id,
            client_name   = data.client_name or data.client_id,
            login         = data.login.strip().lower(),
            password_hash = pw_hash,
        )
        db.add(cred)

    await db.commit()
    await db.refresh(cred)
    return {"ok": True, "login": cred.login, "client_id": cred.client_id}


@router.post("/login")
async def portal_login(data: PortalLoginPayload, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == data.tenant_id,
            PortalCredential.login     == data.login.strip().lower(),
        )
    )
    cred = result.scalar_one_or_none()
    if not cred or not verify_password(data.password, cred.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"client_id": cred.client_id, "client_name": cred.client_name}


@router.get("/credentials")
async def get_credentials(
    tenant_id: int = Query(1),
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
    tenant_id:        int = 1
    portal_client_id: str
    text:             str
    source:           str = 'portal'  # 'portal' | 'tg'


class PortalChatReplyPayload(BaseModel):
    tenant_id:        int = 1
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
async def portal_chat_send(data: PortalChatSendPayload, db: AsyncSession = Depends(get_db)):
    """Portal client sends a message to the accountant."""
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    cred_res = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == data.tenant_id,
            PortalCredential.client_id == data.portal_client_id,
        )
    )
    cred = cred_res.scalar_one_or_none()
    client_name = cred.client_name if cred else data.portal_client_id

    msg = PortalMessage(
        tenant_id        = data.tenant_id,
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
    await db.commit()
    await db.refresh(msg)
    return {"ok": True, "id": msg.id}


@router.post("/chat/reply")
async def portal_chat_reply(data: PortalChatReplyPayload, db: AsyncSession = Depends(get_db)):
    """Accountant sends a reply visible on the portal."""
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    msg = PortalMessage(
        tenant_id        = data.tenant_id,
        portal_client_id = data.portal_client_id,
        client_name      = None,
        text             = data.text.strip(),
        direction        = "outbound",
        sender_name      = data.sender_name,
        timestamp        = datetime.utcnow(),
        is_read          = True,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {"ok": True, "id": msg.id}


@router.get("/chat/inbox")
async def portal_chat_inbox(
    tenant_id: int = Query(1),
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
    client_id: str = Query(...),
    tenant_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
):
    """Portal client (or accountant) gets full chat history for one client."""
    result = await db.execute(
        select(PortalMessage)
        .where(
            PortalMessage.tenant_id        == tenant_id,
            PortalMessage.portal_client_id == client_id,
        )
        .order_by(PortalMessage.timestamp)
    )
    return {"messages": [_msg_dict(m) for m in result.scalars().all()]}


# ─── Documents ────────────────────────────────────────────────────────────────

@router.get("/documents")
async def portal_documents(
    client_id: str = Query(...),
    tenant_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
):
    """Return documents for a portal client, matched by counterparty name."""
    cred_res = await db.execute(
        select(PortalCredential).where(
            PortalCredential.tenant_id == tenant_id,
            PortalCredential.client_id == client_id,
        )
    )
    cred = cred_res.scalar_one_or_none()
    if not cred or not cred.client_name:
        return {"documents": []}

    search = f"%{cred.client_name.lower()}%"
    result = await db.execute(
        select(OneCDocument)
        .where(
            OneCDocument.tenant_id == tenant_id,
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
