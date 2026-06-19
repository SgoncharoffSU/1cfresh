from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from app.db.database import Base


class ClientChannel(Base):
    __tablename__ = "client_channels"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_id", "channel", name="uq_client_channel"),
        Index("ix_client_channels_lookup", "tenant_id", "channel", "channel_ref"),
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id   = Column(Integer, nullable=False, index=True)
    client_id   = Column(String(200), ForeignKey("client_contacts.id", ondelete="CASCADE"), nullable=False)
    channel     = Column(String(20), nullable=False)   # значение IntegrationKey
    channel_ref = Column(String(200), nullable=False)  # внешний id: TG chat_id, portal client_id и т.д.
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
