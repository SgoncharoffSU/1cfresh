from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from app.db.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_client", "tenant_id", "client_id"),
        Index("ix_chat_messages_channel_ts", "tenant_id", "channel", "timestamp"),
    )

    id             = Column(String(100), primary_key=True)  # сохраняем формат фронтенда: tg-<id>-<chat>, m-<ts>...
    tenant_id      = Column(Integer, nullable=False, index=True)
    channel        = Column(String(20), nullable=False)
    client_id      = Column(String(200), ForeignKey("client_contacts.id", ondelete="SET NULL"), nullable=True)
    sender_id      = Column(String(200), nullable=False)
    sender_name    = Column(String(300), nullable=False)
    sender_avatar  = Column(String(500), nullable=True)
    text           = Column(Text, nullable=False)
    attachments_json = Column(Text, nullable=True)
    timestamp      = Column(DateTime, nullable=False, index=True)
    is_read        = Column(Boolean, default=False, nullable=False)
    tg_chat_id     = Column(String(100), nullable=True)
    username       = Column(String(200), nullable=True)
    done           = Column(Boolean, default=False, nullable=False)
    done_at        = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
