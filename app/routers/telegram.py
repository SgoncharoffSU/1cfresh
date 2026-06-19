"""Telegram Bot integration — webhook receiver + message relay, backed by chat_messages."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.db.database import AsyncSessionLocal
from app.models.chat_message import ChatMessage
from app.models.client_channel import ClientChannel
from app.models.telegram_state import TelegramPollState

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])

# Telegram has no concept of tenant — the bot token in .env is one bot per deployment.
TENANT_ID = 1


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────────

class SendRequest(BaseModel):
    chat_id: int | str
    text:    str


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _tg_api(method: str) -> str:
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    return f"https://api.telegram.org/bot{token}/{method}"


def _to_api_msg(m: ChatMessage) -> dict:
    return {
        "id":          m.id,
        "chat_id":     int(m.tg_chat_id) if m.tg_chat_id else 0,
        "sender_id":   m.sender_id,
        "sender_name": m.sender_name,
        "username":    m.username or "",
        "text":        m.text,
        "timestamp":   m.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "channel":     "TG",
        "read":        m.is_read,
    }


async def _store_message(update: dict) -> dict | None:
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return None
    chat = msg.get("chat", {})
    sender = msg.get("from", {})
    msg_id = f"tg-{msg['message_id']}-{chat['id']}"

    async with AsyncSessionLocal() as db:
        existing = await db.get(ChatMessage, msg_id)
        if existing:
            logger.debug("TG duplicate skipped: %s", msg_id)
            return None

        chat_id = str(chat["id"])
        ch_res = await db.execute(
            select(ClientChannel).where(
                ClientChannel.tenant_id == TENANT_ID,
                ClientChannel.channel   == "TG",
                ClientChannel.channel_ref == chat_id,
            )
        )
        link = ch_res.scalar_one_or_none()

        record = ChatMessage(
            id           = msg_id,
            tenant_id    = TENANT_ID,
            channel      = "TG",
            client_id    = link.client_id if link else None,
            sender_id    = str(sender.get("id", "")),
            sender_name  = (
                f"{sender.get('first_name', '')} {sender.get('last_name', '')}".strip()
                or sender.get("username", "Unknown")
            ),
            username     = sender.get("username", ""),
            text         = msg.get("text", ""),
            timestamp    = datetime.utcfromtimestamp(msg["date"]),
            is_read      = False,
            tg_chat_id   = chat_id,
        )
        db.add(record)
        await db.commit()
        logger.info("TG message stored: %s", msg_id)
        return _to_api_msg(record)


# ──────────────────────────────────────────────────────────────────────────────
# Webhook endpoint (needs HTTPS; set with /setWebhook)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    """Telegram calls this URL for each update (requires HTTPS)."""
    payload: dict[str, Any] = await request.json()
    await _store_message(payload)
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# REST API for the frontend
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/messages")
async def get_messages(limit: int = 50, since_id: str | None = None) -> dict:
    """Return stored *inbound* Telegram messages (frontend polls this every few seconds).

    Outbound (accountant-sent) messages are excluded — the frontend already adds them to the
    chat optimistically on send, and /sent-messages serves them separately for delivery tracking.
    """
    async with AsyncSessionLocal() as db:
        q = select(ChatMessage).where(
            ChatMessage.tenant_id == TENANT_ID,
            ChatMessage.channel   == "TG",
            ChatMessage.sender_id != "u1",
        )
        if since_id:
            since = await db.get(ChatMessage, since_id)
            if since:
                q = q.where(ChatMessage.timestamp > since.timestamp)
        q = q.order_by(ChatMessage.timestamp.desc()).limit(limit)
        result = await db.execute(q)
        msgs = list(reversed(result.scalars().all()))

        total_res = await db.execute(
            select(ChatMessage.id).where(
                ChatMessage.tenant_id == TENANT_ID,
                ChatMessage.channel   == "TG",
                ChatMessage.sender_id != "u1",
            )
        )
        total = len(total_res.all())

    return {"messages": [_to_api_msg(m) for m in msgs], "total": total}


@router.post("/send")
async def send_message(body: SendRequest) -> dict:
    """Send a message from the accountant back to the Telegram user."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _tg_api("sendMessage"),
            json={"chat_id": body.chat_id, "text": body.text},
        )
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=502, detail=data.get("description", "Telegram error"))
    tg_msg_id = data["result"]["message_id"]

    chat_id = str(body.chat_id)
    async with AsyncSessionLocal() as db:
        ch_res = await db.execute(
            select(ClientChannel).where(
                ClientChannel.tenant_id == TENANT_ID,
                ClientChannel.channel   == "TG",
                ClientChannel.channel_ref == chat_id,
            )
        )
        link = ch_res.scalar_one_or_none()
        db.add(ChatMessage(
            id          = f"sent-{tg_msg_id}-{chat_id}",
            tenant_id   = TENANT_ID,
            channel     = "TG",
            client_id   = link.client_id if link else None,
            sender_id   = "u1",
            sender_name = "Бухгалтер",
            text        = body.text,
            timestamp   = datetime.utcnow(),
            is_read     = True,
            tg_chat_id  = chat_id,
        ))
        await db.commit()

    return {"ok": True, "message_id": tg_msg_id}


@router.get("/sent-messages")
async def get_sent_messages(limit: int = 50) -> dict:
    """Return outbound messages with TG message_id for delivery tracking."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.tenant_id == TENANT_ID, ChatMessage.sender_id == "u1")
            .order_by(ChatMessage.timestamp.desc())
            .limit(limit)
        )
        msgs = list(reversed(result.scalars().all()))
    return {
        "messages": [
            {
                "id":        m.id,
                "chat_id":   int(m.tg_chat_id) if m.tg_chat_id else 0,
                "text":      m.text,
                "tg_msg_id": m.id.split("-")[1] if m.id.startswith("sent-") else None,
                "sent_at":   m.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "delivered": True,
            }
            for m in msgs
        ],
        "total": len(msgs),
    }


@router.get("/recent-chats")
async def recent_chats() -> dict:
    """Return unique recent TG senders — used in schedule modal to pick a chat."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.tenant_id == TENANT_ID,
                ChatMessage.channel   == "TG",
                ChatMessage.sender_id != "u1",
            )
            .order_by(ChatMessage.timestamp.desc())
            .limit(200)
        )
        msgs = result.scalars().all()

    seen: dict[str, dict] = {}
    for m in msgs:
        cid = m.tg_chat_id
        if cid and cid not in seen:
            seen[cid] = {
                "chat_id":     int(cid),
                "sender_name": m.sender_name or "",
                "username":    m.username or "",
            }
    return {"chats": list(seen.values())[:20]}


@router.get("/status")
async def bot_status() -> dict:
    """Check if bot token is configured and bot is alive."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return {"configured": False, "hint": "Set TELEGRAM_BOT_TOKEN in .env"}

    async with httpx.AsyncClient(timeout=8) as client:
        try:
            resp = await client.get(_tg_api("getMe"))
            data = resp.json()
            if data.get("ok"):
                bot = data["result"]
                return {
                    "configured": True,
                    "bot_username": bot.get("username"),
                    "bot_name":     bot.get("first_name"),
                }
        except Exception as exc:
            return {"configured": True, "error": str(exc)}
    return {"configured": True, "error": "Unexpected response"}


# ──────────────────────────────────────────────────────────────────────────────
# Long-poll helper (call from Celery task or startup background task)
# ──────────────────────────────────────────────────────────────────────────────

async def poll_once(long_poll_timeout: int = 0) -> int:
    """Fetch pending Telegram updates; return count of new messages.

    Use long_poll_timeout=0 for Celery tasks (immediate return).
    Use long_poll_timeout=25 for a dedicated polling loop.
    """
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    if not token:
        return 0

    async with AsyncSessionLocal() as db:
        state_res = await db.execute(
            select(TelegramPollState).where(TelegramPollState.tenant_id == TENANT_ID)
        )
        state = state_res.scalar_one_or_none()
        offset = state.last_offset if state else 0

    http_timeout = long_poll_timeout + 5
    async with httpx.AsyncClient(timeout=http_timeout) as client:
        try:
            resp = await client.get(
                _tg_api("getUpdates"),
                params={"offset": offset, "timeout": long_poll_timeout, "limit": 100},
            )
        except Exception as exc:
            logger.warning("Telegram poll error: %s", exc)
            return 0

    data = resp.json()
    if not data.get("ok"):
        return 0

    updates: list[dict] = data.get("result", [])
    count = 0
    for upd in updates:
        await _store_message(upd)
        offset = upd["update_id"] + 1
        count += 1

    if updates:
        async with AsyncSessionLocal() as db:
            state_res = await db.execute(
                select(TelegramPollState).where(TelegramPollState.tenant_id == TENANT_ID)
            )
            state = state_res.scalar_one_or_none()
            if state:
                state.last_offset = offset
            else:
                db.add(TelegramPollState(tenant_id=TENANT_ID, last_offset=offset))
            await db.commit()

    return count
