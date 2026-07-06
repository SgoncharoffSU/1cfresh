"""
Migration: add onec_documents.basis_key — the ref_key of the document a SALE or
FACTURA row was created from (its source счёт), so the app can show which
documents are "based on" which (Счёт -> Реализация / Счёт-фактура).
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_document_basis_key
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

COL = "ALTER TABLE onec_documents ADD COLUMN basis_key VARCHAR(36) NULL"


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        cols = {c["name"] for c in insp.get_columns("onec_documents")}
        if "basis_key" not in cols:
            conn.execute(text(COL))
            print("Added column: onec_documents.basis_key")
        else:
            print("Column already exists: onec_documents.basis_key")
    print("Migration complete.")


if __name__ == "__main__":
    run()
