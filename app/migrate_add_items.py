"""Add items_json and comment columns to onec_documents."""
from sqlalchemy import create_engine, text
from app.config import settings

url = settings.DATABASE_URL
url = url.replace("postgresql+asyncpg://", "postgresql://")
url = url.replace("mysql+aiomysql://", "mysql+pymysql://")
if url.startswith("mysql://"):
    url = url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(url, pool_pre_ping=True)

with engine.connect() as conn:
    for col, ddl in [
        ("items_json", "ALTER TABLE onec_documents ADD COLUMN items_json LONGTEXT NULL"),
        ("comment",    "ALTER TABLE onec_documents ADD COLUMN comment VARCHAR(1000) NULL"),
    ]:
        try:
            conn.execute(text(ddl))
            conn.commit()
            print(f"Added column: {col}")
        except Exception as e:
            if "Duplicate column" in str(e) or "already exists" in str(e):
                print(f"Column {col} already exists — skipping")
            else:
                print(f"Error adding {col}: {e}")
