import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schedule import DocumentSchedule
from app.schemas.doc_schedule import DocScheduleCreate, DocScheduleOut, DocScheduleUpdate
from app.services.schedule_service import compute_next_run, describe_schedule

router = APIRouter(prefix="/doc-schedules", tags=["doc-schedules"])


@router.get("/", response_model=List[DocScheduleOut])
async def list_schedules(
    tenant_id:        int            = Query(1),
    counterparty_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(DocumentSchedule).where(DocumentSchedule.tenant_id == tenant_id)
    if counterparty_key:
        q = q.where(DocumentSchedule.counterparty_key == counterparty_key)
    result = await db.execute(q.order_by(DocumentSchedule.id))
    return list(result.scalars().all())


@router.post("/", response_model=DocScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_schedule(data: DocScheduleCreate, db: AsyncSession = Depends(get_db)):
    desc = data.description or describe_schedule(data.schedule_type, data.schedule_config)
    obj = DocumentSchedule(
        tenant_id         = data.tenant_id,
        document_ref_key  = data.document_ref_key,
        document_number   = data.document_number,
        counterparty_key  = data.counterparty_key,
        counterparty_name = data.counterparty_name,
        amount            = data.amount,
        schedule_type     = data.schedule_type,
        schedule_config   = json.dumps(data.schedule_config, ensure_ascii=False),
        description       = desc,
        is_active         = data.is_active,
        is_posted         = data.is_posted,
        delivery_channel  = data.delivery_channel,
        delivery_address  = data.delivery_address,
        message           = data.message,
        next_run          = compute_next_run(data.schedule_type, data.schedule_config),
        error_count       = 0,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.put("/{schedule_id}", response_model=DocScheduleOut)
async def update_schedule(
    schedule_id: int, data: DocScheduleUpdate, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DocumentSchedule).where(DocumentSchedule.id == schedule_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if data.schedule_type is not None:
        obj.schedule_type = data.schedule_type
    if data.schedule_config is not None:
        obj.schedule_config = json.dumps(data.schedule_config, ensure_ascii=False)
    if data.is_active is not None:
        obj.is_active = data.is_active
    if data.is_posted is not None:
        obj.is_posted = data.is_posted
    if data.delivery_channel is not None:
        obj.delivery_channel = data.delivery_channel
    if data.delivery_address is not None:
        obj.delivery_address = data.delivery_address
    if data.message is not None:
        obj.message = data.message

    cfg = json.loads(obj.schedule_config)
    obj.description = data.description or describe_schedule(obj.schedule_type, cfg)
    obj.next_run    = compute_next_run(obj.schedule_type, cfg)
    # Reset errors on manual update so it can retry
    obj.error_count = 0
    obj.last_error  = None

    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{schedule_id}/toggle", response_model=DocScheduleOut)
async def toggle_schedule(schedule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentSchedule).where(DocumentSchedule.id == schedule_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Schedule not found")
    obj.is_active   = not obj.is_active
    obj.error_count = 0
    obj.last_error  = None
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(schedule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentSchedule).where(DocumentSchedule.id == schedule_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(obj)
    await db.commit()


@router.post("/{schedule_id}/fire")
async def fire_schedule_now(schedule_id: int):
    """Manually fire one schedule immediately (for testing)."""
    from app.tasks.schedule_tasks import check_document_schedules
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.config import settings
    from app.models.schedule import DocumentSchedule
    from datetime import datetime

    url = settings.DATABASE_URL
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("mysql+aiomysql://",     "mysql+pymysql://")
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    engine = create_engine(url, pool_pre_ping=True)

    with Session(engine) as db:
        s = db.query(DocumentSchedule).filter_by(id=schedule_id).first()
        if not s:
            raise HTTPException(status_code=404, detail="Schedule not found")
        s.next_run = datetime.utcnow()
        db.commit()

    result = check_document_schedules.delay()
    data   = result.get(timeout=60)
    return {"status": "ok", "result": data}
