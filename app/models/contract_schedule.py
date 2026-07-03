from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from app.db.database import Base


class ContractSchedule(Base):
    """Расписание автоматического выставления документов."""
    __tablename__ = "contract_schedules"

    id                   = Column(Integer, primary_key=True, index=True)
    tenant_id            = Column(Integer, nullable=False, index=True)
    # ref_key документа-основания (договор, счёт, реализация, сч.фактура)
    contract_ref_key     = Column(String(36), nullable=False, index=True)
    # Тип документа-основания: CONTRACT | INVOICE | SALE | FACTURA
    basis_doc_type       = Column(String(20), nullable=False, default="CONTRACT")
    # Что создаёт ЭТО расписание: all | INVOICE | SALE | FACTURA
    doc_type_target      = Column(String(20), nullable=False, default="all")
    counterparty_key     = Column(String(36), nullable=False)
    counterparty_name    = Column(String(500), default="")

    # Периодичность: weekly | monthly | quarterly
    frequency            = Column(String(20), nullable=False, default="monthly")
    week_day             = Column(Integer, nullable=True)
    month_day            = Column(String(10), nullable=True, default="1")

    # Что создавать (используется при doc_type_target='all')
    create_invoice       = Column(Boolean, default=True, nullable=False)
    create_sale          = Column(Boolean, default=False, nullable=False)
    create_factura       = Column(Boolean, default=False, nullable=False)
    month_in_nomenclature = Column(Boolean, default=False, nullable=False)

    delivery_channel     = Column(String(20), nullable=True)
    delivery_address     = Column(String(500), nullable=True)

    custom_fields           = Column(Text, nullable=True)
    items_json              = Column(Text, nullable=True)   # JSON: [{description, qty, price, vat}]
    template_invoice_ref    = Column(String(36), nullable=True)  # ref_key счёта-шаблона

    is_active            = Column(Boolean, default=True, nullable=False)
    next_run             = Column(DateTime, nullable=True)
    last_run             = Column(DateTime, nullable=True)
    run_count            = Column(Integer, default=0, nullable=False)
    error_count          = Column(Integer, default=0, nullable=False)
    last_error           = Column(Text, nullable=True)

    created_at           = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
