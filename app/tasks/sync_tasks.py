"""Celery tasks for syncing documents from 1C."""
import logging

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.sync_tasks.sync_all_tenants")
def sync_all_tenants() -> dict:
    """Pull documents from every active tenant's 1C and upsert into local DB."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.config import settings
    from app.models.tenant import Tenant
    from app.services.sync_service import sync_tenant

    # Use a sync engine for Celery (not async)
    url = settings.DATABASE_URL
    # Normalise async drivers → sync drivers for Celery
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("mysql+aiomysql://",     "mysql+pymysql://")
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        pass  # psycopg2 used by default

    engine = create_engine(url, pool_pre_ping=True)
    totals: dict = {}

    with Session(engine) as db:
        tenants = db.query(Tenant).filter(Tenant.is_active.is_(True)).all()
        logger.info("sync_all_tenants: %d active tenant(s)", len(tenants))
        for tenant in tenants:
            try:
                result = sync_tenant(tenant, db)
                totals[tenant.id] = result
            except Exception as exc:
                logger.error("tenant=%d sync failed: %s", tenant.id, exc)
                totals[tenant.id] = {"error": str(exc)}

    return totals


@celery_app.task(name="app.tasks.sync_tasks.sync_one_tenant")
def sync_one_tenant(tenant_id: int) -> dict:
    """Sync a single tenant on demand (triggered from API)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.config import settings
    from app.models.tenant import Tenant
    from app.services.sync_service import sync_tenant

    url = settings.DATABASE_URL
    # Normalise async drivers → sync drivers for Celery
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("mysql+aiomysql://",     "mysql+pymysql://")
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        pass  # psycopg2 used by default

    engine = create_engine(url, pool_pre_ping=True)
    with Session(engine) as db:
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} not found")
        return sync_tenant(tenant, db)
