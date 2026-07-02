from sqlalchemy import Column, Integer

from app.db.database import Base


class AbonentCounter(Base):
    """Per-tenant sequential counter for ClientContact.abonent_number, incremented
    atomically via INSERT ... ON DUPLICATE KEY UPDATE (see app/services/abonent_service.py)."""
    __tablename__ = "abonent_counters"

    tenant_id   = Column(Integer, primary_key=True)
    last_number = Column(Integer, nullable=False, default=0)
