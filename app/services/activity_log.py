"""Single write path for the unified audit trail (app/models/activity_log.py).

log_activity() only calls db.add() — it never commits. A log entry therefore only
survives if the caller's own subsequent `await db.commit()` succeeds, which is the
desired behavior: we log what actually happened, not what was attempted.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog


async def log_activity(
    db: AsyncSession,
    *,
    actor_type: str,
    action: str,
    description: str,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    firm_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[object] = None,
    request: Optional[Request] = None,
) -> None:
    db.add(ActivityLog(
        actor_type=actor_type,
        actor_id=actor_id,
        actor_name=actor_name,
        firm_id=firm_id,
        action=action,
        description=description,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=request.client.host if request and request.client else None,
    ))
