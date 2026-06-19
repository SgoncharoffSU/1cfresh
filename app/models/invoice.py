import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.database import Base


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT_TO_1C = "sent_to_1c"
    PDF_RECEIVED = "pdf_received"
    EMAIL_SENT = "email_sent"
    EDO_SENT = "edo_sent"
    COMPLETED = "completed"
    FAILED = "failed"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(50), unique=True, nullable=False, index=True)
    date = Column(DateTime, default=datetime.utcnow, nullable=False)

    client_name = Column(String(200), nullable=False)
    client_inn = Column(String(12), nullable=False)
    client_email = Column(String(200), nullable=False)
    client_diadoc_id = Column(String(100), nullable=True)

    amount = Column(Float, nullable=False)
    vat_rate = Column(Float, default=20.0, nullable=False)

    onec_guid = Column(String(100), nullable=True)
    pdf_path = Column(String(500), nullable=True)

    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.DRAFT, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(500), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String(50), default="шт", nullable=False)
    price = Column(Float, nullable=False)
    vat_rate = Column(Float, default=20.0, nullable=False)

    invoice = relationship("Invoice", back_populates="items")


class RecurringSchedule(Base):
    __tablename__ = "recurring_schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    cron_expression = Column(String(100), nullable=False)
    template_data = Column(Text, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
