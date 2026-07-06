"""
Migration: add client_branding.seal_path / client_branding.facsimile_path — organization
seal and signature-facsimile images imported from 1C (Catalog_Организации.ФайлПечать /
ФайлФаксимильнаяПечать), separate from the manually-uploaded combined stamp_path.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_branding_1c_files
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

COLUMNS = {
    "seal_path":      "ALTER TABLE client_branding ADD COLUMN seal_path VARCHAR(300) NULL",
    "facsimile_path": "ALTER TABLE client_branding ADD COLUMN facsimile_path VARCHAR(300) NULL",
}


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        cols = {c["name"] for c in insp.get_columns("client_branding")}
        for name, ddl in COLUMNS.items():
            if name not in cols:
                conn.execute(text(ddl))
                print(f"Added column: client_branding.{name}")
            else:
                print(f"Column already exists: client_branding.{name}")
    print("Migration complete.")


if __name__ == "__main__":
    run()
