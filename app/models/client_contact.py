from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String
from app.db.database import Base


class ClientContact(Base):
    __tablename__ = "client_contacts"

    id            = Column(String(200), primary_key=True)  # frontend-сгенерированный id или id контрагента 1С
    tenant_id     = Column(Integer, nullable=False, index=True)
    name          = Column(String(500), nullable=False)
    short_name    = Column(String(200), nullable=False)
    inn           = Column(String(20), nullable=True)
    initials      = Column(String(10), nullable=False)
    color         = Column(String(100), nullable=False)
    portal_login         = Column(String(100), nullable=True)
    portal_password_hash = Column(String(300), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
