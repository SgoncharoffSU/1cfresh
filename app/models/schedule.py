from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from app.db.database import Base


class DocumentSchedule(Base):
    """Recurring invoice schedule tied to a specific 1C document."""
    __tablename__ = "document_schedules"

    id               = Column(Integer, primary_key=True, index=True)
    tenant_id        = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"),
                              nullable=False, index=True)

    # Source document snapshot from 1C
    document_ref_key  = Column(String(36),  nullable=False)
    document_number   = Column(String(100),  default="")
    counterparty_key  = Column(String(36),   default="")
    counterparty_name = Column(String(500),  default="")
    amount            = Column(Numeric(15, 2), default=0)

    # Schedule definition
    schedule_type   = Column(String(30), nullable=False)  # interval_minutes | interval_days | monthly_days | weekly_days
    schedule_config = Column(Text,       nullable=False)  # JSON
    description     = Column(String(500), default="")

    # 1C document options
    is_posted = Column(Boolean, default=False, nullable=False)  # Whether to post (провести) the created document

    # Delivery channel after invoice creation
    delivery_channel = Column(String(20), nullable=True)   # TG | EMAIL | INTERNAL | EDO | None
    delivery_address = Column(String(500), nullable=True)  # TG chat_id, email, etc.
    message          = Column(Text, nullable=True)         # Optional message sent with invoice

    # Runtime state
    is_active  = Column(Boolean,  default=True, nullable=False)
    next_run   = Column(DateTime, nullable=True)
    last_run   = Column(DateTime, nullable=True)
    run_count  = Column(Integer,  default=0)

    # Error tracking
    error_count = Column(Integer, default=0, nullable=False)
    last_error  = Column(Text, nullable=True)

    # Delivery status of the last run
    last_delivery_ok = Column(Boolean, nullable=True)
    last_delivery_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
