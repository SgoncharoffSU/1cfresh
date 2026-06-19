from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.db.database import Base


class Firm(Base):
    """Accounting firm — top-level tenant in the multi-firm hierarchy."""
    __tablename__ = "firms"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(200), nullable=False)          # Название бухгалтерии
    inn        = Column(String(12), nullable=True)            # ИНН (hook for billing/RBAC)
    plan       = Column(String(20), default="free")           # free | basic | pro (billing zadel)
    is_active  = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class User(Base):
    """User belonging to a Firm with role-based access (RBAC zadel)."""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    firm_id         = Column(Integer, ForeignKey("firms.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    email           = Column(String(200), nullable=False, unique=True, index=True)
    username        = Column(String(100), nullable=True,  unique=True, index=True)  # optional login alias
    hashed_password = Column(String(200), nullable=False)
    name            = Column(String(200), nullable=False)
    role            = Column(String(30), default="CHIEF_ACCOUNTANT")  # CHIEF_ACCOUNTANT | ACCOUNTANT
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
