"""
Migration: add client_contacts.abonent_number + abonent_counters table, backfill existing rows.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_abonent_number
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

DDL_COUNTERS = """CREATE TABLE IF NOT EXISTS abonent_counters (
    tenant_id   INT NOT NULL PRIMARY KEY,
    last_number INT NOT NULL DEFAULT 0
)"""

COL_ABONENT_NUMBER = "ALTER TABLE client_contacts ADD COLUMN abonent_number INT NULL"
UNIQUE_ABONENT_NUMBER = (
    "ALTER TABLE client_contacts ADD UNIQUE KEY uq_tenant_abonent (tenant_id, abonent_number)"
)


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        conn.execute(text(DDL_COUNTERS))
        print("OK: abonent_counters")

        cols = {c["name"] for c in insp.get_columns("client_contacts")}
        if "abonent_number" not in cols:
            conn.execute(text(COL_ABONENT_NUMBER))
            print("Added column: client_contacts.abonent_number")
        else:
            print("Column already exists: client_contacts.abonent_number")

        # Backfill: assign 1..N per tenant_id, ordered by created_at, only for rows still NULL.
        tenants = conn.execute(
            text("SELECT DISTINCT tenant_id FROM client_contacts WHERE abonent_number IS NULL")
        ).scalars().all()
        for tenant_id in tenants:
            rows = conn.execute(
                text(
                    "SELECT id FROM client_contacts "
                    "WHERE tenant_id = :t AND abonent_number IS NULL "
                    "ORDER BY created_at"
                ),
                {"t": tenant_id},
            ).scalars().all()
            start = conn.execute(
                text("SELECT COALESCE(MAX(abonent_number), 0) FROM client_contacts WHERE tenant_id = :t"),
                {"t": tenant_id},
            ).scalar_one()
            for i, client_id in enumerate(rows, start=start + 1):
                conn.execute(
                    text("UPDATE client_contacts SET abonent_number = :n WHERE id = :id"),
                    {"n": i, "id": client_id},
                )
            last = start + len(rows)
            conn.execute(
                text(
                    "INSERT INTO abonent_counters (tenant_id, last_number) VALUES (:t, :n) "
                    "ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, :n)"
                ),
                {"t": tenant_id, "n": last},
            )
            print(f"Backfilled tenant_id={tenant_id}: {len(rows)} row(s), counter={last}")

        # Unique constraint only makes sense once every row has a number.
        remaining_null = conn.execute(
            text("SELECT COUNT(*) FROM client_contacts WHERE abonent_number IS NULL")
        ).scalar_one()
        if remaining_null == 0:
            existing_keys = {k["name"] for k in insp.get_indexes("client_contacts")}
            if "uq_tenant_abonent" not in existing_keys:
                conn.execute(text(UNIQUE_ABONENT_NUMBER))
                print("Added unique key: uq_tenant_abonent")
            else:
                print("Unique key already exists: uq_tenant_abonent")
        else:
            print(f"Skipped unique key — {remaining_null} row(s) still NULL")

    print("Migration complete.")


if __name__ == "__main__":
    run()
