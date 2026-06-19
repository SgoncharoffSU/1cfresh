from datetime import datetime
from sqlalchemy import Column, DateTime, Integer
from app.db.database import Base


class TelegramPollState(Base):
    __tablename__ = "telegram_poll_state"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id   = Column(Integer, nullable=False, unique=True)
    last_offset = Column(Integer, nullable=False, default=0)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
