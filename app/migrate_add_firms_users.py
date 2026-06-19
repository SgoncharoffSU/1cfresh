"""
Migration: add firms, users tables + firm_id to tenants + seed test account.
Run once:
    cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_firms_users
"""
from sqlalchemy import create_engine, text, inspect

from app.config import settings
from app.services.auth_service import hash_password

_url = settings.DATABASE_URL
if _url.startswith("mysql+aiomysql://"):
    _url = _url.replace("mysql+aiomysql://", "mysql+pymysql://")
elif _url.startswith("mysql://"):
    _url = _url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(_url, pool_pre_ping=True)

DDL = [
    # firms
    """CREATE TABLE IF NOT EXISTS firms (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(200) NOT NULL,
        inn        VARCHAR(12)  NULL,
        plan       VARCHAR(20)  NOT NULL DEFAULT 'free',
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    # users
    """CREATE TABLE IF NOT EXISTS users (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        firm_id          INT          NOT NULL,
        email            VARCHAR(200) NOT NULL UNIQUE,
        username         VARCHAR(100) NULL UNIQUE,
        hashed_password  VARCHAR(200) NOT NULL,
        name             VARCHAR(200) NOT NULL,
        role             VARCHAR(30)  NOT NULL DEFAULT 'CHIEF_ACCOUNTANT',
        is_active        TINYINT(1)   NOT NULL DEFAULT 1,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_users_firm (firm_id),
        CONSTRAINT fk_users_firm FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
    )""",
]

COL_FIRM_ID = "ALTER TABLE tenants ADD COLUMN firm_id INT NULL, ADD INDEX idx_tenants_firm (firm_id)"

# Seed: test account  login=goncharovsu / 143430SeR → links to tenant id=1
SEED_FIRM_NAME     = "ИП Гончаров С.Ю."
SEED_FIRM_INN      = "502111111105"
SEED_USER_USERNAME = "goncharovsu"
SEED_USER_EMAIL    = "goncharovsu@local"
SEED_USER_NAME     = "Гончаров Сергей Юрьевич"
SEED_USER_PASSWORD = "143430SeR"


def run() -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        # Create tables
        for ddl in DDL:
            conn.execute(text(ddl))
            print(f"OK: {ddl.split('(')[0].strip()}")

        # Add firm_id to tenants if missing
        cols = {c["name"] for c in insp.get_columns("tenants")}
        if "firm_id" not in cols:
            conn.execute(text(COL_FIRM_ID))
            print("Added column: tenants.firm_id")
        else:
            print("Column already exists: tenants.firm_id")

        # Seed test firm + user
        existing_user = conn.execute(
            text("SELECT id FROM users WHERE username = :u"), {"u": SEED_USER_USERNAME}
        ).first()

        if not existing_user:
            # Create firm
            conn.execute(
                text("INSERT INTO firms (name, inn, plan) VALUES (:n, :i, 'free')"),
                {"n": SEED_FIRM_NAME, "i": SEED_FIRM_INN},
            )
            firm_id = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()

            # Create user
            pw = hash_password(SEED_USER_PASSWORD)
            conn.execute(
                text("""INSERT INTO users (firm_id, email, username, hashed_password, name, role)
                        VALUES (:fid, :email, :uname, :pw, :name, 'CHIEF_ACCOUNTANT')"""),
                {"fid": firm_id, "email": SEED_USER_EMAIL, "uname": SEED_USER_USERNAME,
                 "pw": pw, "name": SEED_USER_NAME},
            )
            print(f"Created seed firm id={firm_id} + user username={SEED_USER_USERNAME}")

            # Link existing tenant id=1 to this firm
            conn.execute(
                text("UPDATE tenants SET firm_id = :fid WHERE id = 1 AND firm_id IS NULL"),
                {"fid": firm_id},
            )
            print("Linked tenant id=1 to seed firm")
        else:
            print(f"Seed user already exists (id={existing_user[0]}), skipping")

    print("Migration complete.")


if __name__ == "__main__":
    run()
