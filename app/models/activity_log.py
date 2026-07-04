from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db.database import Base


class ActivityLog(Base):
    """Unified audit trail — every state-changing action in the system, regardless of
    which identity tier performed it (accountant/employee, abonent, superadmin, or an
    internal system process like a webhook or the Telegram poller)."""
    __tablename__ = "activity_logs"

    id          = Column(Integer, primary_key=True, index=True)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor_type  = Column(String(20), nullable=False)   # user | superadmin | abonent | system
    actor_id    = Column(Integer, nullable=True)        # NULL for abonent (string UUID) and system actors
    actor_name  = Column(String(200), nullable=True)    # denormalized snapshot — survives actor rename/deletion

    firm_id     = Column(Integer, ForeignKey("firms.id", ondelete="SET NULL"), nullable=True, index=True)

    action      = Column(String(100), nullable=False, index=True)   # dotted code, e.g. "client.create"
    # Hand-built human-readable summary only — NEVER str(pydantic_model) or f"{body}",
    # which would leak a password field straight into the audit trail.
    description = Column(Text, nullable=False)

    entity_type = Column(String(50), nullable=True)
    entity_id   = Column(String(64), nullable=True, index=True)   # string: covers both int PKs and UUID PKs

    ip_address  = Column(String(64), nullable=True)
