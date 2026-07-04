"""Chat message history — shared across devices for one tenant."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_tenant, get_current_user
from app.db.database import get_db
from app.models.chat_message import ChatMessage
from app.models.firm import User
from app.services.activity_log import log_activity

router = APIRouter(prefix="/chat", tags=["chat"])


class MessageIn(BaseModel):
    id:            str
    channel:       str
    senderId:      str
    senderName:    str
    senderAvatar:  Optional[str] = None
    text:          str
    attachments:   Optional[list[str]] = None
    timestamp:     str
    read:          bool = False
    clientId:      Optional[str] = None
    tgChatId:      Optional[str] = None
    username:      Optional[str] = None
    done:          bool = False


def _msg_dict(m: ChatMessage) -> dict:
    return {
        "id":           m.id,
        "channel":      m.channel,
        "senderId":     m.sender_id,
        "senderName":   m.sender_name,
        "senderAvatar": m.sender_avatar,
        "text":         m.text,
        "attachments":  json.loads(m.attachments_json) if m.attachments_json else None,
        "timestamp":    m.timestamp.isoformat() + "Z",
        "read":         m.is_read,
        "clientId":     m.client_id,
        "tgChatId":     m.tg_chat_id,
        "username":     m.username,
        "done":         m.done,
        "doneAt":       (m.done_at.isoformat() + "Z") if m.done_at else None,
    }


@router.get("/messages")
async def list_messages(
    client_id: Optional[str] = Query(None),
    channel:   Optional[str] = Query(None),
    since_id:  Optional[str] = Query(None),
    limit:     int = Query(2000, le=5000),
    tenant_id: int = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    q = select(ChatMessage).where(ChatMessage.tenant_id == tenant_id)
    if client_id:
        q = q.where(ChatMessage.client_id == client_id)
    if channel:
        q = q.where(ChatMessage.channel == channel)
    if since_id:
        since = await db.get(ChatMessage, since_id)
        if since:
            q = q.where(ChatMessage.timestamp > since.timestamp)
    q = q.order_by(ChatMessage.timestamp).limit(limit)
    result = await db.execute(q)
    return {"messages": [_msg_dict(m) for m in result.scalars().all()]}


@router.post("/messages")
async def create_message(
    data: MessageIn,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent by id — safe to retry from pollers/optimistic UI."""
    existing = await db.get(ChatMessage, data.id)
    if existing:
        return {"ok": True, "id": existing.id}

    msg = ChatMessage(
        id              = data.id,
        tenant_id       = tenant_id,
        channel         = data.channel,
        client_id       = data.clientId,
        sender_id       = data.senderId,
        sender_name     = data.senderName,
        sender_avatar   = data.senderAvatar,
        text            = data.text,
        attachments_json = json.dumps(data.attachments) if data.attachments else None,
        timestamp       = datetime.fromisoformat(data.timestamp.replace("Z", "+00:00")).replace(tzinfo=None),
        is_read         = data.read,
        tg_chat_id       = data.tgChatId,
        username        = data.username,
        done            = data.done,
    )
    db.add(msg)
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="chat.create_message",
                        description=f"Сообщение в чат ({data.channel}) клиенту {data.clientId or '—'}",
                        entity_type="chat_message", entity_id=msg.id)
    await db.commit()
    return {"ok": True, "id": msg.id}


@router.patch("/messages/{message_id}/done")
async def mark_done(
    message_id: str,
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    msg = await db.get(ChatMessage, message_id)
    if not msg or msg.tenant_id != tenant_id:
        return {"ok": False}
    msg.done    = True
    msg.done_at = datetime.utcnow()
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="chat.mark_done",
                        description=f"Сообщение {message_id} отмечено обработанным",
                        entity_type="chat_message", entity_id=message_id)
    await db.commit()
    return {"ok": True}


@router.delete("/messages")
async def delete_client_messages(
    client_id: str = Query(...),
    tenant_id: int = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(ChatMessage).where(ChatMessage.tenant_id == tenant_id, ChatMessage.client_id == client_id)
    )
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="chat.delete_messages",
                        description=f"Удалена переписка с клиентом {client_id}",
                        entity_type="client", entity_id=client_id)
    await db.commit()
    return {"ok": True}
