"""Auth API: register, login, me, tenant setup."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.firm import Firm, User
from app.models.tenant import Tenant
from app.schemas.auth import (
    LoginIn, RegisterIn, TenantSetupIn, TenantSetupOut, TokenOut, UserOut,
)
from app.services.auth_service import create_token, decode_token, hash_password, verify_password

router  = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


# ── Dependency: extract current user from JWT ─────────────────────────────────

async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db:    AsyncSession = Depends(get_db),
) -> User:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not creds:
        raise exc
    try:
        payload = decode_token(creds.credentials)
    except ValueError:
        raise exc
    # Tokens issued before the `typ` claim existed have none — treat as "admin" for
    # backward compatibility. Tokens explicitly typed for another tier (superadmin,
    # abonent) must never be usable here.
    typ = payload.get("typ")
    if typ is not None and typ != "admin":
        raise exc
    result = await db.execute(select(User).where(User.id == payload.get("sub")))
    user   = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc
    return user


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _first_tenant_id(db: AsyncSession, firm_id: int) -> Optional[int]:
    """The firm's legacy/general-scope tenant (chat, tasks, portal) — never one of the
    per-client 1C connections added via POST /clients/onec-connect, which must stay
    invisible to this resolver or chat/portal scoping could randomly leak across clients."""
    res = await db.execute(
        select(Tenant.id)
        .where(Tenant.firm_id == firm_id, Tenant.client_contact_id.is_(None))
        .limit(1)
    )
    row = res.first()
    return row[0] if row else None


async def get_current_tenant(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> int:
    """Resolve tenant_id from the JWT-derived user — never accepted from the client."""
    tenant_id = await _first_tenant_id(db, user.firm_id)
    if tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not configured")
    return tenant_id


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, db: AsyncSession = Depends(get_db)):
    """Create a Firm + admin User + blank Tenant placeholder, return JWT."""
    # Unique email check
    existing = await db.execute(select(User).where(User.email == data.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email уже зарегистрирован")

    firm = Firm(
        name                = data.firm_name,
        inn                 = data.firm_inn or None,
        subscription_status = "trial",
        trial_started_at    = datetime.utcnow(),
        usage_docs_month    = 0,
        usage_clients_count = 0,
    )
    db.add(firm)
    await db.flush()  # get firm.id

    user = User(
        firm_id         = firm.id,
        email           = data.email.lower(),
        hashed_password = hash_password(data.password),
        name            = data.name,
        role            = "CHIEF_ACCOUNTANT",
    )
    db.add(user)
    await db.flush()

    # Blank tenant — credentials filled in during onboarding
    tenant = Tenant(
        firm_id        = firm.id,
        name           = data.firm_name,
        odata_url      = "",
        odata_login    = "",
        odata_password = "",
        is_active      = False,
    )
    db.add(tenant)
    await db.flush()

    await db.commit()

    token = create_token({"sub": user.id, "firm_id": firm.id, "role": user.role, "typ": "admin"})
    return TokenOut(
        access_token = token,
        user_id      = user.id,
        firm_id      = firm.id,
        tenant_id    = tenant.id,
        name         = user.name,
        email        = user.email,
        role         = user.role,
    )


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    # Accept username or email
    from sqlalchemy import or_
    ident  = data.email.strip()
    result = await db.execute(
        select(User).where(or_(User.email == ident.lower(), User.username == ident))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    tenant_id = await _first_tenant_id(db, user.firm_id)
    token = create_token({"sub": user.id, "firm_id": user.firm_id, "role": user.role, "typ": "admin"})
    return TokenOut(
        access_token = token,
        user_id      = user.id,
        firm_id      = user.firm_id,
        tenant_id    = tenant_id,
        name         = user.name,
        email        = user.email,
        role         = user.role,
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    firm_res = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm     = firm_res.scalar_one()
    tenant_id = await _first_tenant_id(db, user.firm_id)
    return UserOut(
        id        = user.id,
        firm_id   = user.firm_id,
        tenant_id = tenant_id,
        name      = user.name,
        email     = user.email,
        role      = user.role,
        firm_name = firm.name,
        firm_inn  = firm.inn,
        firm_plan = firm.subscription_plan or "trial",
    )


@router.put("/tenant", response_model=TenantSetupOut)
async def setup_tenant(
    data: TenantSetupIn,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Save / update the firm's legacy/general-scope 1C connection (not a per-client one)."""
    res    = await db.execute(
        select(Tenant)
        .where(Tenant.firm_id == user.firm_id, Tenant.client_contact_id.is_(None))
        .limit(1)
    )
    tenant = res.scalar_one_or_none()

    # Test connection before saving
    connected = False
    try:
        from app.services.onec_odata import OneCODataClient
        client = OneCODataClient(
            login    = data.odata_login,
            password = data.odata_password,
            base_url = data.odata_url,
        )
        client.ping()
        connected = True
    except Exception:
        pass

    if tenant is None:
        firm_res = await db.execute(select(Firm).where(Firm.id == user.firm_id))
        firm     = firm_res.scalar_one()
        tenant   = Tenant(
            firm_id        = user.firm_id,
            name           = firm.name,
            odata_url      = data.odata_url,
            odata_login    = data.odata_login,
            odata_password = data.odata_password,
            is_active      = connected,
        )
        db.add(tenant)
    else:
        tenant.odata_url      = data.odata_url
        tenant.odata_login    = data.odata_login
        tenant.odata_password = data.odata_password
        tenant.is_active      = connected

    await db.commit()
    await db.refresh(tenant)
    return TenantSetupOut(
        tenant_id = tenant.id,
        name      = tenant.name,
        odata_url = tenant.odata_url,
        connected = connected,
    )


@router.get("/tenant", response_model=TenantSetupOut)
async def get_tenant(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Return the firm's legacy/general-scope 1C connection settings (not a per-client one)."""
    res    = await db.execute(
        select(Tenant)
        .where(Tenant.firm_id == user.firm_id, Tenant.client_contact_id.is_(None))
        .limit(1)
    )
    tenant = res.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not configured")
    return TenantSetupOut(
        tenant_id = tenant.id,
        name      = tenant.name,
        odata_url = tenant.odata_url,
        connected = tenant.is_active,
    )
