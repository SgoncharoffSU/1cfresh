"""Billing API: subscription status, YooKassa payments, usage tracking."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.db.database import get_db
from app.models.firm import Firm, User
from app.models.tenant import Tenant
from app.services.activity_log import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

TRIAL_DAYS = 15

# Tariff numbers are a first pass, not final — easy to retune here.
PLANS = {
    "pro": {
        "name":         "Профи",
        "price_month":  2900,
        "price_year":   29000,
        "max_clients":  30,
        "max_docs_month": 500,
        "extra_doc_price": 5,
        "included_integrations":   5,
        "extra_integration_price": 500,
        "included_employees":      1,
        "extra_employee_price":    990,
    },
    "bureau": {
        "name":         "Бюро",
        "price_month":  6900,
        "price_year":   69000,
        "max_clients":  None,
        "max_docs_month": None,
        "extra_doc_price": 0,
        "included_integrations":   None,  # unlimited
        "extra_integration_price": 0,
        "included_employees":      None,  # unlimited
        "extra_employee_price":    0,
    },
}


async def _integrations_used(db: AsyncSession, firm_id: int) -> int:
    """Live count — deliberately not cached (unlike usage_docs_month/usage_clients_count,
    which are known-stale — see plan notes) since a per-firm Tenant count is cheap to query."""
    from sqlalchemy import func
    res = await db.execute(
        select(func.count(Tenant.id)).where(
            Tenant.firm_id == firm_id,
            Tenant.client_contact_id.isnot(None),
            Tenant.is_active == True,  # noqa: E712
        )
    )
    return res.scalar_one()


def _integration_overage(plan: Optional[str], integrations_used: int) -> int:
    plan_info = PLANS.get(plan or "pro", PLANS["pro"])
    included = plan_info["included_integrations"]
    if included is None:
        return 0
    return max(0, integrations_used - included)


async def _employees_used(db: AsyncSession, firm_id: int) -> int:
    """Live count, same non-cached pattern as _integrations_used. Subtracts 1 to
    exclude the original registrant/owner — there's no separate is_owner flag, so
    "total active users minus the founding one" is the accepted convention for how
    many employees have actually been *added*."""
    from sqlalchemy import func
    res = await db.execute(
        select(func.count(User.id)).where(
            User.firm_id == firm_id,
            User.is_active == True,  # noqa: E712
        )
    )
    return max(0, res.scalar_one() - 1)


def _employee_overage(plan: Optional[str], employees_used: int) -> int:
    plan_info = PLANS.get(plan or "pro", PLANS["pro"])
    included = plan_info["included_employees"]
    if included is None:
        return 0
    return max(0, employees_used - included)

YOOKASSA_SHOP_ID  = os.getenv("YOOKASSA_SHOP_ID",  "")
YOOKASSA_SECRET   = os.getenv("YOOKASSA_SECRET_KEY", "")
APP_URL           = os.getenv("APP_URL", "https://buhgsaas-159-194-225-55.sslip.io")


# ── helpers ────────────────────────────────────────────────────────────────────

def _days_left(firm: Firm) -> int:
    """Days remaining in current trial or subscription."""
    if firm.subscription_status == "trial":
        started = firm.trial_started_at or firm.created_at
        ends    = started + timedelta(days=TRIAL_DAYS)
        delta   = (ends - datetime.utcnow()).days
        return max(0, delta)
    if firm.subscription_status == "active" and firm.subscription_ends_at:
        delta = (firm.subscription_ends_at - datetime.utcnow()).days
        return max(0, delta)
    return 0


def _is_access_allowed(firm: Firm) -> bool:
    if firm.subscription_status in ("active",):
        return True
    if firm.subscription_status == "trial" and _days_left(firm) > 0:
        return True
    return False


# ── schemas ────────────────────────────────────────────────────────────────────

class BillingStatus(BaseModel):
    status:            str           # trial | active | expired | suspended
    plan:              Optional[str]
    days_left:         int
    trial_ends_at:     Optional[str]
    subscription_ends_at: Optional[str]
    usage_docs_month:  int
    usage_clients:     int
    access_allowed:    bool
    plans:             dict
    integrations_used:        int
    integrations_included:    Optional[int]
    extra_integration_price:  int
    employees_used:           int
    employees_included:       Optional[int]
    extra_employee_price:     int
    estimated_amount:         float   # what the next create-payment call would charge, right now


class CreatePaymentIn(BaseModel):
    plan:    str   # pro | bureau
    period:  str = "month"  # month | year


class CreatePaymentOut(BaseModel):
    payment_id:      str
    confirmation_url: str
    amount:          float
    plan:            str


class AdminActivateIn(BaseModel):
    firm_id:  int
    plan:     str
    months:   int = 1


# ── routes ─────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=BillingStatus)
async def get_billing_status(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    res  = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = res.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")

    # Lazy-init trial if not set
    if not firm.trial_started_at:
        firm.trial_started_at    = datetime.utcnow()
        firm.subscription_status = "trial"
        await db.commit()
        await db.refresh(firm)

    # Auto-expire trial
    if firm.subscription_status == "trial" and _days_left(firm) == 0:
        firm.subscription_status = "expired"
        await log_activity(db, actor_type="system", firm_id=firm.id,
                            action="billing.trial_expired",
                            description=f"Пробный период фирмы «{firm.name}» истёк")
        await db.commit()
        await db.refresh(firm)

    started = firm.trial_started_at or firm.created_at
    trial_ends = (started + timedelta(days=TRIAL_DAYS)).isoformat() if started else None

    integrations_used = await _integrations_used(db, firm.id)
    employees_used     = await _employees_used(db, firm.id)
    plan_key   = firm.subscription_plan or "pro"
    plan_info  = PLANS.get(plan_key, PLANS["pro"])
    overage    = _integration_overage(plan_key, integrations_used)
    employee_overage = _employee_overage(plan_key, employees_used)
    base_price = plan_info["price_month"]
    estimated_amount = float(
        base_price
        + overage * plan_info["extra_integration_price"]
        + employee_overage * plan_info["extra_employee_price"]
    )

    return BillingStatus(
        status            = firm.subscription_status,
        plan              = firm.subscription_plan,
        days_left         = _days_left(firm),
        trial_ends_at     = trial_ends,
        subscription_ends_at = firm.subscription_ends_at.isoformat() if firm.subscription_ends_at else None,
        usage_docs_month  = firm.usage_docs_month or 0,
        usage_clients     = firm.usage_clients_count or 0,
        access_allowed    = _is_access_allowed(firm),
        plans             = PLANS,
        integrations_used       = integrations_used,
        integrations_included   = plan_info["included_integrations"],
        extra_integration_price = plan_info["extra_integration_price"],
        employees_used          = employees_used,
        employees_included      = plan_info["included_employees"],
        extra_employee_price    = plan_info["extra_employee_price"],
        estimated_amount        = estimated_amount,
    )


@router.post("/create-payment", response_model=CreatePaymentOut)
async def create_payment(
    body: CreatePaymentIn,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Create a YooKassa payment. Returns redirect URL."""
    if body.plan not in PLANS:
        raise HTTPException(400, "Unknown plan")

    plan_info    = PLANS[body.plan]
    base_amount  = plan_info["price_year"] if body.period == "year" else plan_info["price_month"]

    integrations_used = await _integrations_used(db, user.firm_id)
    overage    = _integration_overage(body.plan, integrations_used)
    employees_used   = await _employees_used(db, user.firm_id)
    employee_overage = _employee_overage(body.plan, employees_used)
    # Overage is always billed as a monthly add-on (500₽/integration/mo, 990₽/employee/mo),
    # even on the yearly plan — charging it ×12 up front would be a surprising jump if
    # someone connects a new client or hires mid-year, so it's kept as a flat per-cycle
    # surcharge.
    overage_charge  = overage * plan_info["extra_integration_price"]
    employee_charge = employee_overage * plan_info["extra_employee_price"]
    amount = base_amount + overage_charge + employee_charge

    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="billing.create_payment",
                        description=(
                            f"Инициирован платёж: тариф {plan_info['name']} ({body.period})"
                            + (f", {overage} доп. интеграций" if overage else "")
                            + (f", {employee_overage} доп. сотрудников" if employee_overage else "")
                        ),
                        entity_type="firm", entity_id=user.firm_id)
    await db.commit()

    if not YOOKASSA_SHOP_ID or not YOOKASSA_SECRET:
        # YooKassa not configured — return a mock response for development
        return CreatePaymentOut(
            payment_id       = str(uuid4()),
            confirmation_url = f"{APP_URL}/billing?plan={body.plan}&pending=1",
            amount           = float(amount),
            plan             = body.plan,
        )

    try:
        import requests as req
        from requests.auth import HTTPBasicAuth

        idempotency_key = str(uuid4())
        payload = {
            "amount":       {"value": f"{amount:.2f}", "currency": "RUB"},
            "payment_method_data": {"type": "bank_card"},
            "confirmation": {
                "type":       "redirect",
                "return_url": f"{APP_URL}/billing?payment=success&plan={body.plan}",
            },
            "capture": True,
            "description": (
                f"BuhgSaaS — тариф {plan_info['name']} на {'год' if body.period == 'year' else 'месяц'}"
                + (f" + {overage} доп. интеграций 1С" if overage else "")
                + (f" + {employee_overage} доп. сотрудников" if employee_overage else "")
            ),
            "metadata": {
                "firm_id": str(user.firm_id),
                "plan":    body.plan,
                "period":  body.period,
                "integrations_charged": str(overage),
                "employees_charged":    str(employee_overage),
            },
        }
        r = req.post(
            "https://api.yookassa.ru/v3/payments",
            auth    = HTTPBasicAuth(YOOKASSA_SHOP_ID, YOOKASSA_SECRET),
            headers = {"Idempotence-Key": idempotency_key},
            json    = payload,
            timeout = 15,
        )
        r.raise_for_status()
        data = r.json()
        return CreatePaymentOut(
            payment_id        = data["id"],
            confirmation_url  = data["confirmation"]["confirmation_url"],
            amount            = float(amount),
            plan              = body.plan,
        )
    except Exception as e:
        logger.error("YooKassa payment creation failed: %s", e)
        raise HTTPException(502, "Ошибка создания платежа. Попробуйте позже.")


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle YooKassa payment.succeeded webhook."""
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    if event.get("event") != "payment.succeeded":
        return {"ok": True}

    payment = event.get("object", {})
    metadata = payment.get("metadata", {})
    firm_id  = int(metadata.get("firm_id", 0))
    plan     = metadata.get("plan", "")
    period   = metadata.get("period", "month")

    if not firm_id or plan not in PLANS:
        return {"ok": True}

    res  = await db.execute(select(Firm).where(Firm.id == firm_id))
    firm = res.scalar_one_or_none()
    if not firm:
        return {"ok": True}

    months = 12 if period == "year" else 1
    now    = datetime.utcnow()
    ends   = (firm.subscription_ends_at or now) + timedelta(days=30 * months)

    firm.subscription_status  = "active"
    firm.subscription_plan    = plan
    firm.subscription_ends_at = ends
    firm.billing_period_start = now
    await log_activity(db, actor_type="system", firm_id=firm_id,
                        action="billing.webhook_activate",
                        description=f"Оплата подтверждена: тариф {plan} активирован до {ends.date()}")
    await db.commit()

    logger.info("Firm %d activated plan=%s until %s", firm_id, plan, ends)
    return {"ok": True}


@router.post("/admin/activate")
async def admin_activate(
    body: AdminActivateIn,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Manual activation by admin (role=CHIEF_ACCOUNTANT activating their own firm)."""
    if user.firm_id != body.firm_id and user.role != "ADMIN":
        raise HTTPException(403, "Forbidden")
    if body.plan not in PLANS:
        raise HTTPException(400, "Unknown plan")

    res  = await db.execute(select(Firm).where(Firm.id == body.firm_id))
    firm = res.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")

    now  = datetime.utcnow()
    ends = now + timedelta(days=30 * body.months)
    firm.subscription_status  = "active"
    firm.subscription_plan    = body.plan
    firm.subscription_ends_at = ends
    firm.billing_period_start = now
    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=body.firm_id, action="billing.admin_activate",
                        description=f"Вручную активирован тариф {body.plan} на {body.months} мес.")
    await db.commit()
    return {"ok": True, "ends_at": ends.isoformat()}


@router.post("/usage/increment-doc")
async def increment_doc_usage(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    """Called internally when a doc is auto-created via schedule."""
    res  = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = res.scalar_one_or_none()
    if firm:
        firm.usage_docs_month = (firm.usage_docs_month or 0) + 1
        await db.commit()
    return {"ok": True}
