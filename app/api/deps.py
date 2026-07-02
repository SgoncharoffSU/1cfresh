"""Shared cross-tier auth dependencies: superadmin, role checks."""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.firm import User
from app.models.superadmin import SuperAdmin
from app.services.auth_service import decode_token

_bearer = HTTPBearer(auto_error=False)


async def require_superadmin(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db:    AsyncSession = Depends(get_db),
) -> SuperAdmin:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not creds:
        raise exc
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise exc
    if payload.get("typ") != "superadmin":
        raise exc
    result = await db.execute(select(SuperAdmin).where(SuperAdmin.id == payload.get("sub")))
    superadmin = result.scalar_one_or_none()
    if not superadmin or not superadmin.is_active:
        raise exc
    return superadmin


def require_role(*roles: str):
    """Restrict a tier-2 (admin) route to specific User.role values."""
    from app.api.auth import get_current_user

    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _dep
