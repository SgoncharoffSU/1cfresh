import json
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.invoice import InvoiceStatus


class InvoiceItemCreate(BaseModel):
    name: str
    quantity: float
    unit: str = "шт"
    price: float
    vat_rate: float = 20.0


class InvoiceItemResponse(InvoiceItemCreate):
    id: int
    invoice_id: int

    model_config = ConfigDict(from_attributes=True)


class InvoiceCreate(BaseModel):
    number: str
    date: Optional[datetime] = None
    client_name: str
    client_inn: str
    client_email: EmailStr
    client_diadoc_id: Optional[str] = None
    amount: float
    vat_rate: float = 20.0
    items: List[InvoiceItemCreate]


class InvoiceUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    amount: Optional[float] = None
    status: Optional[InvoiceStatus] = None


class InvoiceResponse(BaseModel):
    id: int
    number: str
    date: datetime
    client_name: str
    client_inn: str
    client_email: str
    client_diadoc_id: Optional[str]
    amount: float
    vat_rate: float
    onec_guid: Optional[str]
    pdf_path: Optional[str]
    status: InvoiceStatus
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    items: List[InvoiceItemResponse]

    model_config = ConfigDict(from_attributes=True)


class RecurringScheduleCreate(BaseModel):
    name: str
    cron_expression: str
    template_data: dict
    is_active: bool = True


class RecurringScheduleResponse(BaseModel):
    id: int
    name: str
    cron_expression: str
    template_data: Any
    is_active: bool
    last_run: Optional[datetime]
    next_run: Optional[datetime]
    created_at: datetime

    @field_validator("template_data", mode="before")
    @classmethod
    def parse_template_data(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = ConfigDict(from_attributes=True)
