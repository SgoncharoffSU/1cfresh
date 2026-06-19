import asyncio
import json
import logging
from datetime import datetime

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, name="app.tasks.invoice_tasks.process_invoice_task")
def process_invoice_task(self, invoice_id: int) -> dict:
    from app.db.database import AsyncSessionLocal
    from app.services.invoice_service import process_invoice_full_cycle

    async def _run() -> dict:
        async with AsyncSessionLocal() as db:
            invoice = await process_invoice_full_cycle(db, invoice_id)
            return {"invoice_id": invoice.id, "status": invoice.status.value}

    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error("process_invoice_task failed id=%s: %s", invoice_id, exc)
        raise self.retry(exc=exc)


@celery_app.task(name="app.tasks.invoice_tasks.check_and_run_schedules")
def check_and_run_schedules() -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.config import settings
    from app.models.invoice import RecurringSchedule
    from croniter import croniter

    url = settings.DATABASE_URL
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("mysql+aiomysql://",     "mysql+pymysql://")
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)

    engine = create_engine(url, pool_pre_ping=True)
    now = datetime.utcnow()

    with Session(engine) as db:
        schedules = (
            db.query(RecurringSchedule)
            .filter(
                RecurringSchedule.is_active == True,   # noqa: E712
                RecurringSchedule.next_run  <= now,
            )
            .all()
        )
        for schedule in schedules:
            try:
                logger.info("RecurringSchedule %s triggered", schedule.id)
                cron = croniter(schedule.cron_expression, now)
                schedule.last_run = now
                schedule.next_run = cron.get_next(datetime)
            except Exception as exc:
                logger.error("RecurringSchedule %s failed: %s", schedule.id, exc)
        db.commit()
