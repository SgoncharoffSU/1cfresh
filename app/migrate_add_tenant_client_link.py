"""
Migration: add tenants.client_contact_id — lets a Tenant (1C:Fresh OData connection)
belong to a specific client instead of only the firm as a whole.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_tenant_client_link
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

COL = "ALTER TABLE tenants ADD COLUMN client_contact_id VARCHAR(200) NULL"
UNIQUE_KEY = "ALTER TABLE tenants ADD UNIQUE KEY uq_tenant_client_contact (client_contact_id)"
FK = (
    "ALTER TABLE tenants ADD CONSTRAINT fk_tenant_client_contact "
    "FOREIGN KEY (client_contact_id) REFERENCES client_contacts(id) ON DELETE CASCADE"
)


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        cols = {c["name"] for c in insp.get_columns("tenants")}
        if "client_contact_id" not in cols:
            conn.execute(text(COL))
            print("Added column: tenants.client_contact_id")
        else:
            print("Column already exists: tenants.client_contact_id")

        existing_keys = {k["name"] for k in insp.get_indexes("tenants")}
        if "uq_tenant_client_contact" not in existing_keys:
            conn.execute(text(UNIQUE_KEY))
            print("Added unique key: uq_tenant_client_contact")
        else:
            print("Unique key already exists: uq_tenant_client_contact")

        existing_fks = {f["name"] for f in insp.get_foreign_keys("tenants")}
        if "fk_tenant_client_contact" not in existing_fks:
            conn.execute(text(FK))
            print("Added FK: fk_tenant_client_contact")
        else:
            print("FK already exists: fk_tenant_client_contact")

    print("Migration complete.")


if __name__ == "__main__":
    run()
