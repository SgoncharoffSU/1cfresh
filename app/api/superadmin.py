"""Superadmin (tech support): cross-firm account list + impersonation, fully isolated
from the admin (`users`) and abonent (`client_contacts`) identity spaces — see
app/models/superadmin.py for why this is a separate table rather than a User role."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_superadmin
from app.db.database import get_db
from app.models.activity_log import ActivityLog
from app.models.firm import Firm, User
from app.models.impersonation_log import ImpersonationLog
from app.models.superadmin import SuperAdmin
from app.schemas.activity_log import ActivityLogListOut, ActivityLogOut
from app.schemas.superadmin import (
    AuditLogOut, FirmDetailOut, FirmSummaryOut, FirmUserOut,
    ImpersonateIn, ImpersonateOut, SuperAdminLoginIn, SuperAdminTokenOut,
)
from app.services.activity_log import log_activity
from app.services.auth_service import create_token, verify_password

router = APIRouter(prefix="/superadmin", tags=["superadmin"])

# Impersonation tokens are short-lived — this bounds the audit window without
# needing an explicit "end impersonation" call (see app/models/impersonation_log.py).
_IMPERSONATION_TTL = 2 * 3600


@router.post("/login", response_model=SuperAdminTokenOut)
async def superadmin_login(data: SuperAdminLoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SuperAdmin).where(SuperAdmin.email == data.email.strip().lower()))
    superadmin = result.scalar_one_or_none()
    if not superadmin or not superadmin.is_active or not verify_password(data.password, superadmin.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    token = create_token({"sub": superadmin.id, "typ": "superadmin"})
    await log_activity(db, actor_type="superadmin", actor_id=superadmin.id, actor_name=superadmin.name,
                        action="superadmin.login",
                        description=f"Вход супер-администратора {superadmin.email}")
    await db.commit()
    return SuperAdminTokenOut(
        access_token  = token,
        superadmin_id = superadmin.id,
        name          = superadmin.name,
        email         = superadmin.email,
    )


@router.get("/firms", response_model=list[FirmSummaryOut])
async def list_firms(
    superadmin: SuperAdmin = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Firm, func.count(User.id))
        .outerjoin(User, User.firm_id == Firm.id)
        .group_by(Firm.id)
        .order_by(Firm.created_at.desc())
    )
    rows = result.all()
    await log_activity(db, actor_type="superadmin", actor_id=superadmin.id, actor_name=superadmin.name,
                        action="superadmin.view_firms", description="Просмотр списка фирм")
    await db.commit()
    return [
        FirmSummaryOut(
            id                  = firm.id,
            name                = firm.name,
            inn                 = firm.inn,
            is_active           = firm.is_active,
            subscription_status = firm.subscription_status,
            subscription_plan   = firm.subscription_plan,
            user_count          = user_count,
            created_at          = firm.created_at,
        )
        for firm, user_count in rows
    ]


@router.get("/firms/{firm_id}", response_model=FirmDetailOut)
async def get_firm(
    firm_id: int,
    superadmin: SuperAdmin = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    firm = await db.get(Firm, firm_id)
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    user_count_res = await db.execute(select(func.count(User.id)).where(User.firm_id == firm_id))
    user_count = user_count_res.scalar_one()

    users_res = await db.execute(select(User).where(User.firm_id == firm_id).order_by(User.created_at))
    users = users_res.scalars().all()

    await log_activity(db, actor_type="superadmin", actor_id=superadmin.id, actor_name=superadmin.name,
                        firm_id=firm_id, action="superadmin.view_firm",
                        description=f"Просмотр карточки фирмы «{firm.name}»",
                        entity_type="firm", entity_id=firm_id)
    await db.commit()

    return FirmDetailOut(
        firm = FirmSummaryOut(
            id                  = firm.id,
            name                = firm.name,
            inn                 = firm.inn,
            is_active           = firm.is_active,
            subscription_status = firm.subscription_status,
            subscription_plan   = firm.subscription_plan,
            user_count          = user_count,
            created_at          = firm.created_at,
        ),
        users = [FirmUserOut.model_validate(u) for u in users],
    )


@router.post("/firms/{firm_id}/impersonate", response_model=ImpersonateOut)
async def impersonate_firm(
    firm_id: int,
    data: ImpersonateIn,
    request: Request,
    superadmin: SuperAdmin = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    firm = await db.get(Firm, firm_id)
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    if data.target_user_id is not None:
        target = await db.get(User, data.target_user_id)
        if not target or target.firm_id != firm_id:
            raise HTTPException(status_code=404, detail="User not found in this firm")
    else:
        users_res = await db.execute(
            select(User).where(User.firm_id == firm_id).order_by(User.created_at).limit(1)
        )
        target = users_res.scalar_one_or_none()
        if not target:
            raise HTTPException(status_code=404, detail="Firm has no users to impersonate")

    token = create_token(
        {
            "sub":              target.id,
            "firm_id":          firm_id,
            "role":             target.role,
            "typ":              "admin",
            "impersonated_by":  superadmin.id,
        },
        expires_in=_IMPERSONATION_TTL,
    )

    db.add(ImpersonationLog(
        superadmin_id  = superadmin.id,
        firm_id        = firm_id,
        target_user_id = target.id,
        started_at     = datetime.utcnow(),
        ip_address     = request.client.host if request.client else None,
        user_agent     = request.headers.get("user-agent"),
    ))
    await log_activity(db, actor_type="superadmin", actor_id=superadmin.id, actor_name=superadmin.name,
                        firm_id=firm_id, action="superadmin.impersonate",
                        description=f"Вход в аккаунт фирмы «{firm.name}» под пользователем {target.name}",
                        entity_type="user", entity_id=target.id, request=request)
    await db.commit()

    return ImpersonateOut(
        access_token = token,
        firm_id      = firm_id,
        user_id      = target.id,
        redirect     = f"/cli/{firm_id}/dashboard",
    )


@router.get("/audit", response_model=list[AuditLogOut])
async def audit_log(
    _: SuperAdmin = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ImpersonationLog, SuperAdmin.name, Firm.name, User.name)
        .join(SuperAdmin, SuperAdmin.id == ImpersonationLog.superadmin_id)
        .join(Firm, Firm.id == ImpersonationLog.firm_id)
        .join(User, User.id == ImpersonationLog.target_user_id)
        .order_by(ImpersonationLog.started_at.desc())
        .limit(200)
    )
    return [
        AuditLogOut(
            id               = log.id,
            superadmin_name  = sa_name,
            firm_id          = log.firm_id,
            firm_name        = firm_name,
            target_user_name = user_name,
            started_at       = log.started_at,
        )
        for log, sa_name, firm_name, user_name in result.all()
    ]


@router.get("/activity", response_model=ActivityLogListOut)
async def list_activity(
    limit:      int = Query(50, le=200),
    offset:     int = Query(0, ge=0),
    firm_id:    Optional[int] = Query(None),
    actor_type: Optional[str] = Query(None),
    action:     Optional[str] = Query(None),
    date_from:  Optional[datetime] = Query(None),
    date_to:    Optional[datetime] = Query(None),
    _: SuperAdmin = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Unified activity feed — every logged action, from any actor tier."""
    q = select(ActivityLog, Firm.name).outerjoin(Firm, Firm.id == ActivityLog.firm_id)
    if firm_id is not None:
        q = q.where(ActivityLog.firm_id == firm_id)
    if actor_type:
        q = q.where(ActivityLog.actor_type == actor_type)
    if action:
        q = q.where(ActivityLog.action == action)
    if date_from:
        q = q.where(ActivityLog.created_at >= date_from)
    if date_to:
        q = q.where(ActivityLog.created_at <= date_to)

    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar_one()
    rows = await db.execute(q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit))

    items = [
        ActivityLogOut(
            id=a.id, created_at=a.created_at, actor_type=a.actor_type,
            actor_id=a.actor_id, actor_name=a.actor_name, firm_id=a.firm_id,
            firm_name=fname, action=a.action, description=a.description,
            entity_type=a.entity_type, entity_id=a.entity_id,
        )
        for a, fname in rows.all()
    ]
    return ActivityLogListOut(items=items, total=total)
