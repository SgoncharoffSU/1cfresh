from celery import Celery

from app.config import settings

celery_app = Celery(
    "invoice_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.invoice_tasks",
        "app.tasks.sync_tasks",
        "app.tasks.schedule_tasks",
        "app.tasks.contract_tasks",
        # telegram_polling intentionally excluded: API process handles TG polling
        # via _telegram_polling_loop in main.py to keep _messages in one process
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Moscow",
    enable_utc=True,
    beat_schedule={
        "check-recurring-schedules": {
            "task": "app.tasks.invoice_tasks.check_and_run_schedules",
            "schedule": 60.0,
        },
        # "telegram-poll" REMOVED — API process polls TG directly (see main.py)
        # Having Celery also poll causes a race: both advance the Telegram offset
        # independently, so each process misses messages the other already confirmed.
        "sync-1c-documents": {
            "task": "app.tasks.sync_tasks.sync_all_tenants",
            "schedule": 600.0,
        },
        "check-document-schedules": {
            "task": "app.tasks.schedule_tasks.check_document_schedules",
            "schedule": 60.0,  # every minute
        },
        "check-contract-schedules": {
            "task": "app.tasks.contract_tasks.check_contract_schedules",
            "schedule": 60.0,
        },
    },
)
