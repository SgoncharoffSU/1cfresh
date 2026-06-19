"""Celery task: short-poll Telegram for new messages every 5 seconds."""
import asyncio
import logging

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.telegram_polling.poll_telegram", bind=True,
                 max_retries=0, ignore_result=True)
def poll_telegram(self) -> None:
    """Pull pending updates from Telegram (short-poll, timeout=0)."""
    from app.routers.telegram import poll_once   # local import avoids circular
    count = asyncio.run(poll_once())
    if count:
        logger.info("Telegram: fetched %d new message(s)", count)
