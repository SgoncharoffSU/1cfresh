from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)

from app.db.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id             = Column(Integer, primary_key=True, index=True)
    firm_id        = Column(Integer, ForeignKey("firms.id", ondelete="SET NULL"),
                            nullable=True, index=True)
    name           = Column(String(200), nullable=False)
    odata_url      = Column(String(500), nullable=False)
    odata_login    = Column(String(200), nullable=False)
    odata_password = Column(String(200), nullable=False)
    is_active      = Column(Boolean, default=True, nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)


class OneCDocument(Base):
    """Documents pulled from 1C and cached locally for fast reads."""
    __tablename__ = "onec_documents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "ref_key", name="uq_tenant_refkey"),
    )

    id                = Column(Integer, primary_key=True, index=True)
    tenant_id         = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    ref_key           = Column(String(36), nullable=False)  # 1C GUID
    doc_type          = Column(String(20), nullable=False)  # INVOICE | SALE
    number            = Column(String(100))
    date              = Column(DateTime)
    counterparty_key  = Column(String(36))
    counterparty_name = Column(String(500))
    counterparty_inn  = Column(String(20))
    amount            = Column(Numeric(15, 2), default=0)
    is_posted         = Column(Boolean, default=False)
    deletion_mark     = Column(Boolean, default=False, nullable=False)
    data_version      = Column(String(100))
    items_json        = Column(Text, nullable=True)      # JSON array of Товары line items
    comment           = Column(String(1000), nullable=True)
    synced_at         = Column(DateTime, default=datetime.utcnow,
                               onupdate=datetime.utcnow, nullable=False)
