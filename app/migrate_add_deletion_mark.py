"""Add deletion_mark column to onec_documents."""
from sqlalchemy import create_engine, text
from app.config import settings

url = settings.DATABASE_URL
url = url.replace("postgresql+asyncpg://", "postgresql://")
url = url.replace("mysql+aiomysql://", "mysql+pymysql://")
if url.startswith("mysql://"):
    url = url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(url, pool_pre_ping=True)

with engine.connect() as conn:
    try:
        conn.execute(text(
            "ALTER TABLE onec_documents ADD COLUMN deletion_mark TINYINT(1) NOT NULL DEFAULT 0"
        ))
        conn.commit()
        print("Added column: deletion_mark")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e):
            print("Column deletion_mark already exists — skipping")
        else:
            print(f"Error: {e}")
