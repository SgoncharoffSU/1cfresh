from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint
from app.db.database import Base


class PortalCredential(Base):
    __tablename__ = "portal_credentials"
    __table_args__ = (
        UniqueConstraint("tenant_id", "login", name="uq_portal_login"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    tenant_id   = Column(Integer, nullable=False, index=True)
    client_id   = Column(String(200), nullable=False)   # frontend client ID
    client_name = Column(String(500), nullable=True)
    login       = Column(String(100), nullable=False)
    password_hash = Column(String(300), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
