from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.db.database import Base


class SuperAdmin(Base):
    """Tech-support account with cross-firm access — a separate identity space from `users`,
    never scoped to a firm, so a superadmin session can never be confused with an admin one."""
    __tablename__ = "superadmins"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String(200), nullable=False, unique=True, index=True)
    hashed_password = Column(String(200), nullable=False)
    name            = Column(String(200), nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
