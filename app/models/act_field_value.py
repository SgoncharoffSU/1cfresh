from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.db.database import Base


class ClientActFieldValue(Base):
    """Remembered values for act-form fields that don't exist in 1C (Объект, Договор №,
    Стройка, addresses, ОКПО, Инвестор...) — one row per distinct value ever entered for a
    given (client, field). The frontend offers these as pick-from-history suggestions
    (native <datalist>) rather than silently overwriting a single remembered value, since a
    client can legitimately have multiple objects/investors across different acts."""
    __tablename__ = "client_act_field_values"
    __table_args__ = (
        UniqueConstraint("client_id", "field_name", "value", name="uq_client_field_value"),
    )

    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(String(200), ForeignKey("client_contacts.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    field_name = Column(String(50), nullable=False, index=True)
    value      = Column(String(500), nullable=False)
    last_used_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
