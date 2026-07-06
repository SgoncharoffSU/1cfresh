from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel


DocType   = Literal["INVOICE", "SALE", "FACTURA", "CONTRACT"]
DocStatus = Literal["DRAFT", "SENT", "SIGNED", "REJECTED", "OVERDUE"]

DOC_TAB_NAMES: dict[str, str] = {
    "INVOICE":  "Счета на оплату",
    "SALE":     "Реализации",
    "FACTURA":  "Счёт-фактуры",
    "CONTRACT": "Договоры",
}


class CounterpartyOut(BaseModel):
    id:   str
    name: str
    inn:  str

    model_config = {"from_attributes": True}


class DocumentItemOut(BaseModel):
    line_number: str   = ""
    description: str   = ""
    quantity:    float = 0
    price:       float = 0
    amount:      float = 0
    vat_rate:    str   = ""
    vat_amount:  float = 0


class DocumentOut(BaseModel):
    id:            str
    type:          DocType
    tab_name:      str = ""
    number:        str
    date:          Optional[datetime]
    amount:        float
    currency:      str = "RUB"
    status:        DocStatus
    is_posted:     bool = False
    deletion_mark: bool = False
    sent_via:      Optional[str] = None
    counterparty:  CounterpartyOut
    synced_at:     datetime
    items:         List[DocumentItemOut] = []
    comment:       str = ""
    basis_ref_key: Optional[str] = None  # ref_key of the document this one was created from

    model_config = {"from_attributes": True}


class BasedOnRequest(BaseModel):
    based_on_type: Literal["FACTURA", "SALE"]
    is_posted: bool = False


class BasedOnResult(BaseModel):
    guid:      str
    type:      str
    print_url: str


class SyncResult(BaseModel):
    tenant_id: int
    invoices:  int
    sales:     int
    contracts: int = 0
    synced_at: datetime
