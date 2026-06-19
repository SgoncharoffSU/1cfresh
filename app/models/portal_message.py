from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text
from app.db.database import Base


class PortalMessage(Base):
    __tablename__ = "portal_messages"
    __table_args__ = (
        Index("ix_portal_msg_tenant_client", "tenant_id", "portal_client_id"),
    )

    id               = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id        = Column(Integer, nullable=False)
    portal_client_id = Column(String(200), nullable=False)
    client_name      = Column(String(500), nullable=True)
    text             = Column(Text, nullable=False)
    direction        = Column(String(20), nullable=False)  # 'inbound' | 'outbound'
    sender_name      = Column(String(200), nullable=True)
    source           = Column(String(20), nullable=False, default='portal')  # 'portal' | 'tg'
    timestamp        = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_read          = Column(Boolean, default=False, nullable=False)
