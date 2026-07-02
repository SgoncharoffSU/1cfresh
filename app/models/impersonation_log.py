from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.database import Base


class ImpersonationLog(Base):
    """Audit trail: which superadmin impersonated which firm/user, when."""
    __tablename__ = "impersonation_logs"

    id              = Column(Integer, primary_key=True, index=True)
    superadmin_id   = Column(Integer, ForeignKey("superadmins.id"), nullable=False, index=True)
    firm_id         = Column(Integer, ForeignKey("firms.id"), nullable=False, index=True)
    target_user_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at      = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    ip_address      = Column(String(64), nullable=True)
    user_agent      = Column(String(300), nullable=True)
