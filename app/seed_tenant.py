"""
One-time script: insert the initial tenant row.
Run once on the server after deploy:
    cd /var/www/integration-1c && python -m app.seed_tenant
"""
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, engine, Base
import app.models.tenant  # noqa — ensure tables are registered


TENANT = {
    "name":           "ИП Гончаров С.Ю.",
    "odata_url":      "https://msk1.1cfresh.com/a/ea/4078741/odata/standard.odata",
    "odata_login":    "odata.user",
    "odata_password": "143430SeR",
    "is_active":      True,
}


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from app.models.tenant import Tenant
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(Tenant))).scalars().first()
        if existing:
            print(f"Tenant already exists: id={existing.id} name={existing.name!r}")
            return
        tenant = Tenant(**TENANT)
        db.add(tenant)
        await db.commit()
        await db.refresh(tenant)
        print(f"Created tenant id={tenant.id} name={tenant.name!r}")


if __name__ == "__main__":
    asyncio.run(main())
