"""Firm team management — additional User rows a chief accountant can add for their
own firm. First one is free; overage is billed per app/api/billing.py's PLANS
(included_employees/extra_employee_price), same non-blocking pattern as connecting
extra 1C integrations: adding an employee is never refused, it just accrues billing."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.api.deps import require_role
from app.db.database import get_db
from app.models.firm import User
from app.services.activity_log import log_activity
from app.services.auth_service import hash_password

router = APIRouter(prefix="/employees", tags=["employees"])

ROLE_LABEL = {"CHIEF_ACCOUNTANT": "Главный бухгалтер", "ACCOUNTANT": "Бухгалтер"}


class EmployeeOut(BaseModel):
    id:         int
    name:       str
    email:      str
    role:       str
    is_active:  bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EmployeeCreateIn(BaseModel):
    name:     str
    email:    str
    password: str

    @field_validator("password")
    @classmethod
    def _pw_len(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен быть не менее 6 символов")
        return v


@router.get("/", response_model=list[EmployeeOut])
async def list_employees(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
):
    res = await db.execute(select(User).where(User.firm_id == user.firm_id).order_by(User.created_at))
    return res.scalars().all()


@router.post("/", response_model=EmployeeOut, status_code=201)
async def create_employee(
    data: EmployeeCreateIn,
    user: User = Depends(require_role("CHIEF_ACCOUNTANT")),
    db:   AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == data.email.strip().lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email уже зарегистрирован")

    new_user = User(
        firm_id         = user.firm_id,
        email           = data.email.strip().lower(),
        hashed_password = hash_password(data.password),
        name            = data.name.strip(),
        role            = "ACCOUNTANT",
    )
    db.add(new_user)
    await db.flush()

    await log_activity(db, actor_type="user", actor_id=user.id, actor_name=user.name,
                        firm_id=user.firm_id, action="employee.create",
                        description=f"Добавлен сотрудник {new_user.name} ({new_user.email})",
                        entity_type="user", entity_id=new_user.id)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.patch("/{user_id}/toggle-active", response_model=EmployeeOut)
async def toggle_employee_active(
    user_id: int,
    user: User = Depends(require_role("CHIEF_ACCOUNTANT")),
    db:   AsyncSession = Depends(get_db),
):
    target = await db.get(User, user_id)
    if not target or target.firm_id != user.firm_id:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Нельзя деактивировать самого себя")

    target.is_active = not target.is_active
    await log_activity(
        db, actor_type="user", actor_id=user.id, actor_name=user.name,
        firm_id=user.firm_id,
        action="employee.activate" if target.is_active else "employee.deactivate",
        description=f"{'Активирован' if target.is_active else 'Деактивирован'} сотрудник {target.name}",
        entity_type="user", entity_id=target.id,
    )
    await db.commit()
    await db.refresh(target)
    return target
