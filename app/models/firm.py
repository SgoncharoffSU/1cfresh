from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.db.database import Base


class Firm(Base):
    """Accounting firm — top-level tenant in the multi-firm hierarchy."""
    __tablename__ = "firms"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(200), nullable=False)
    inn        = Column(String(12), nullable=True)
    is_active  = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # ── Billing ───────────────────────────────────────────────────────────────
    # status: trial | active | expired | suspended
    subscription_status  = Column(String(20), default="trial", nullable=False)
    subscription_plan    = Column(String(20), nullable=True)    # pro | bureau
    trial_started_at     = Column(DateTime,   nullable=True)
    subscription_ends_at = Column(DateTime,   nullable=True)
    # Usage counters (reset monthly)
    usage_docs_month     = Column(Integer, default=0, nullable=False)
    usage_clients_count  = Column(Integer, default=0, nullable=False)
    billing_period_start = Column(DateTime, nullable=True)


class User(Base):
    """User belonging to a Firm with role-based access."""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    firm_id         = Column(Integer, ForeignKey("firms.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    email           = Column(String(200), nullable=False, unique=True, index=True)
    username        = Column(String(100), nullable=True,  unique=True, index=True)
    hashed_password = Column(String(200), nullable=False)
    name            = Column(String(200), nullable=False)
    role            = Column(String(30), default="CHIEF_ACCOUNTANT")  # CHIEF_ACCOUNTANT | ACCOUNTANT
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
