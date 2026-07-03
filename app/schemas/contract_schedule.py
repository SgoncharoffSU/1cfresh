from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel


Frequency = Literal["weekly", "monthly", "quarterly", "minutes"]
BasisDocType = Literal["CONTRACT", "INVOICE", "SALE", "FACTURA"]
DocTypeTarget = Literal["all", "INVOICE", "SALE", "FACTURA"]


class ScheduleItem(BaseModel):
    description:      str = ""
    qty:              float = 1.0
    price:            float = 0.0
    vat:              str = "БезНДС"
    nomenclature_key: Optional[str] = None   # Ref_Key из Catalog_Номенклатура
    periodicity:      Optional[str] = None   # ПериодичностьУслуги: "Месяц", "Квартал", etc.


class ContractScheduleCreate(BaseModel):
    frequency:             Frequency = "monthly"
    week_day:              Optional[int] = None
    month_day:             Optional[str] = "1"
    create_invoice:        bool = True
    create_sale:           bool = False
    create_factura:        bool = False
    month_in_nomenclature: bool = False
    delivery_channel:      Optional[str] = None
    delivery_address:      Optional[str] = None
    custom_fields:         Optional[List[str]] = None
    # Номенклатура: вручную или эталонный счёт
    items:                    Optional[List[ScheduleItem]] = None
    template_invoice_ref:     Optional[str] = None   # ref_key счёта-шаблона
    is_active:             bool = True
    basis_doc_type:        str = "CONTRACT"
    doc_type_target:       str = "all"


class ContractScheduleUpdate(ContractScheduleCreate):
    pass


class ContractScheduleOut(BaseModel):
    id:                    int
    tenant_id:             int
    contract_ref_key:      str
    basis_doc_type:        str = "CONTRACT"
    doc_type_target:       str = "all"
    counterparty_key:      str
    counterparty_name:     str = ""
    frequency:             str
    week_day:              Optional[int] = None
    month_day:             Optional[str] = None
    create_invoice:        bool
    create_sale:           bool
    create_factura:        bool
    month_in_nomenclature: bool
    delivery_channel:      Optional[str] = None
    delivery_address:      Optional[str] = None
    custom_fields:         Optional[List[str]] = None
    items:                 Optional[List[ScheduleItem]] = None
    template_invoice_ref:  Optional[str] = None
    is_active:             bool
    next_run:              Optional[datetime] = None
    last_run:              Optional[datetime] = None
    run_count:             int = 0
    error_count:           int = 0
    last_error:            Optional[str] = None
    created_at:            datetime

    model_config = {"from_attributes": True}


class ContractOut(BaseModel):
    """Документ из onec_documents + список расписаний."""
    ref_key:           str
    name:              str
    counterparty_key:  str
    counterparty_name: str
    counterparty_inn:  str
    amount:            float
    date_start:        Optional[datetime] = None
    deletion_mark:     bool = False
    synced_at:         datetime
    raw_fields:        dict = {}
    schedules:         List[ContractScheduleOut] = []
