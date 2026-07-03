"""Shared cross-tier auth dependencies: superadmin, role checks, per-client 1C scoping."""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _first_tenant_id, get_current_user
from app.db.database import get_db
from app.models.client_contact import ClientContact
from app.models.firm import User
from app.models.superadmin import SuperAdmin
from app.models.tenant import Tenant
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


async def get_client_tenant(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> int:
    """Resolve the tenant_id of one SPECIFIC client's own 1C connection — distinct from
    get_current_tenant()'s firm-wide legacy tenant. Documents/contracts/doc_schedules are
    per-client now that each client has their own 1C:Fresh base, so they depend on this
    instead. 404s if the client doesn't exist, isn't this firm's, or has no 1C attached yet.
    """
    firm_tenant_id = await _first_tenant_id(db, user.firm_id)
    client = await db.get(ClientContact, client_id)
    if not client or client.tenant_id != firm_tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    res = await db.execute(select(Tenant.id).where(Tenant.client_contact_id == client_id))
    tenant_id = res.scalar_one_or_none()
    if tenant_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="У этого клиента не подключена 1С")
    return tenant_id
