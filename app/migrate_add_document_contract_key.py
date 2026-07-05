"""
Migration: add onec_documents.contract_key — links an INVOICE/SALE document to the
CONTRACT-type row (Catalog_ДоговорыКонтрагентов) it was raised against, so КС-2/КС-3
printing can pull the actual договор №/дата from 1C instead of asking the accountant
to type it in by hand every time.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_document_contract_key
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

COL = "ALTER TABLE onec_documents ADD COLUMN contract_key VARCHAR(36) NULL"


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        cols = {c["name"] for c in insp.get_columns("onec_documents")}
        if "contract_key" not in cols:
            conn.execute(text(COL))
            print("Added column: onec_documents.contract_key")
        else:
            print("Column already exists: onec_documents.contract_key")
    print("Migration complete.")


if __name__ == "__main__":
    run()
