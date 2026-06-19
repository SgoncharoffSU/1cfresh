import json
from datetime import datetime
from typing import List

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.invoice import RecurringSchedule
from app.schemas.invoice import RecurringScheduleCreate, RecurringScheduleResponse

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("/", response_model=List[RecurringScheduleResponse])
async def list_schedules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecurringSchedule).order_by(RecurringSchedule.id))
    return list(result.scalars().all())


@router.post("/", response_model=RecurringScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(data: RecurringScheduleCreate, db: AsyncSession = Depends(get_db)):
    if not croniter.is_valid(data.cron_expression):
        raise HTTPException(status_code=400, detail=f"Invalid cron: {data.cron_expression}")

    next_run = croniter(data.cron_expression, datetime.utcnow()).get_next(datetime)
    schedule = RecurringSchedule(
        name=data.name,
        cron_expression=data.cron_expression,
        template_data=json.dumps(data.template_data, ensure_ascii=False),
        is_active=data.is_active,
        next_run=next_run,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}/toggle", response_model=RecurringScheduleResponse)
async def toggle_schedule(schedule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecurringSchedule).where(RecurringSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.is_active = not schedule.is_active
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(schedule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecurringSchedule).where(RecurringSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(schedule)
    await db.commit()
