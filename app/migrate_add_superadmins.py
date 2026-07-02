"""
Migration: add superadmins + impersonation_logs tables, seed the first superadmin account.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_superadmins
A random password is generated at run time and printed once — it is not stored anywhere
in this file or in git history. Save it immediately; it cannot be recovered afterwards
(only reset by re-running set_password() or updating the hash directly in the DB).
Override the seed email/name via SUPERADMIN_SEED_EMAIL / SUPERADMIN_SEED_NAME env vars.
"""
import os
import secrets

from sqlalchemy import create_engine, text

from app.config import settings
from app.services.auth_service import hash_password

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

DDL = [
    """CREATE TABLE IF NOT EXISTS superadmins (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        email            VARCHAR(200) NOT NULL UNIQUE,
        hashed_password  VARCHAR(200) NOT NULL,
        name             VARCHAR(200) NOT NULL,
        is_active        TINYINT(1)   NOT NULL DEFAULT 1,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS impersonation_logs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        superadmin_id   INT      NOT NULL,
        firm_id         INT      NOT NULL,
        target_user_id  INT      NOT NULL,
        started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address      VARCHAR(64)  NULL,
        user_agent      VARCHAR(300) NULL,
        INDEX idx_imp_superadmin (superadmin_id),
        INDEX idx_imp_firm (firm_id),
        INDEX idx_imp_started (started_at),
        CONSTRAINT fk_imp_superadmin FOREIGN KEY (superadmin_id) REFERENCES superadmins(id),
        CONSTRAINT fk_imp_firm       FOREIGN KEY (firm_id)       REFERENCES firms(id),
        CONSTRAINT fk_imp_user       FOREIGN KEY (target_user_id) REFERENCES users(id)
    )""",
]

SEED_EMAIL = os.environ.get("SUPERADMIN_SEED_EMAIL", "support@glavinstrument.com")
SEED_NAME  = os.environ.get("SUPERADMIN_SEED_NAME", "Техподдержка")


def run() -> None:
    with engine.begin() as conn:
        for ddl in DDL:
            conn.execute(text(ddl))
            print(f"OK: {ddl.split('(')[0].strip()}")

        existing = conn.execute(
            text("SELECT id FROM superadmins WHERE email = :e"), {"e": SEED_EMAIL}
        ).first()
        if not existing:
            seed_password = secrets.token_urlsafe(18)
            # is_active/created_at have Python-side (not DB-side) defaults on the ORM model,
            # so a plain-SQL INSERT must set them explicitly — matters when this table was
            # already created via Base.metadata.create_all rather than the DDL above.
            conn.execute(
                text(
                    "INSERT INTO superadmins (email, hashed_password, name, is_active, created_at) "
                    "VALUES (:email, :pw, :name, 1, NOW())"
                ),
                {"email": SEED_EMAIL, "pw": hash_password(seed_password), "name": SEED_NAME},
            )
            print(f"Created seed superadmin email={SEED_EMAIL}")
            print(f"Password (save now, shown only once): {seed_password}")
        else:
            print(f"Seed superadmin already exists (id={existing[0]}), skipping")

    print("Migration complete.")


if __name__ == "__main__":
    run()
