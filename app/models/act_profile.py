from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.db.database import Base


class ClientActProfile(Base):
    """Per-client boilerplate for printing КС-2/КС-3 acts — address/phone/ОКПО details that
    don't exist anywhere in 1C or the rest of our data model, filled in once by the
    accountant and reused on every subsequent act for that client. Per-act specifics
    (Объект, Договор №/дата, отчётный период) are NOT stored here — they vary act to act
    and are entered fresh each time in the print modal."""
    __tablename__ = "client_act_profiles"

    client_id = Column(String(200), ForeignKey("client_contacts.id", ondelete="CASCADE"),
                        primary_key=True)

    podryadchik_address = Column(String(500), nullable=True)
    podryadchik_phone   = Column(String(100), nullable=True)
    podryadchik_okpo    = Column(String(20),  nullable=True)

    zakazchik_address = Column(String(500), nullable=True)
    zakazchik_phone   = Column(String(100), nullable=True)
    zakazchik_okpo    = Column(String(20),  nullable=True)

    investor_name    = Column(String(500), nullable=True)
    investor_address = Column(String(500), nullable=True)
    investor_okpo    = Column(String(20),  nullable=True)

    stroika_name = Column(String(500), nullable=True)
    okdp         = Column(String(50),  nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
