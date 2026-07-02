import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.invoices import router as invoices_router
from app.api.schedules import router as schedules_router
from app.api.documents import router as documents_router
from app.api.doc_schedules import router as doc_schedules_router
from app.api.print_form import router as print_form_router
from app.api.auth import router as auth_router
from app.api.portal import router as portal_router
from app.api.clients import router as clients_router
from app.api.chat import router as chat_router
from app.api.contracts import router as contracts_router
from app.api.billing import router as billing_router
from app.api.superadmin import router as superadmin_router
from app.routers.telegram import router as telegram_router
from app.db.database import Base, engine
import app.models.firm               # noqa: F401
import app.models.contract_schedule  # noqa: F401
import app.models.tenant             # noqa: F401
import app.models.schedule           # noqa: F401
import app.models.portal_credential  # noqa: F401
import app.models.portal_message     # noqa: F401
import app.models.client_contact     # noqa: F401
import app.models.client_channel     # noqa: F401
import app.models.chat_message       # noqa: F401
import app.models.telegram_state     # noqa: F401
import app.models.superadmin         # noqa: F401
import app.models.impersonation_log  # noqa: F401
import app.models.abonent_counter    # noqa: F401

logger = logging.getLogger(__name__)


async def _telegram_polling_loop() -> None:
    """Poll Telegram every 5 s inside the API process so _messages is shared with handlers."""
    from app.routers.telegram import poll_once
    while True:
        try:
            count = await poll_once()
            if count:
                logger.info("Telegram: received %d new message(s)", count)
        except Exception as exc:
            logger.warning("Telegram polling error: %s", exc)
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    task = asyncio.create_task(_telegram_polling_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="Invoice Automation API",
    description="1С:Фреш + Контур.Диадок — автоматизация выставления счетов",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,          prefix="/api/v1")
app.include_router(invoices_router,      prefix="/api/v1")
app.include_router(schedules_router,     prefix="/api/v1")
app.include_router(documents_router,     prefix="/api/v1")
app.include_router(doc_schedules_router, prefix="/api/v1")
app.include_router(print_form_router,    prefix="/api/v1")
app.include_router(telegram_router,      prefix="/api/v1")
app.include_router(portal_router,        prefix="/api/v1")
app.include_router(clients_router,       prefix="/api/v1")
app.include_router(chat_router,          prefix="/api/v1")
app.include_router(contracts_router,     prefix="/api/v1")
app.include_router(billing_router,       prefix="/api/v1")
app.include_router(superadmin_router,    prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
