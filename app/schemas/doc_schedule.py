import json
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, field_validator


class DocScheduleCreate(BaseModel):
    tenant_id:         int   = 1
    document_ref_key:  str
    document_number:   str   = ""
    counterparty_key:  str   = ""
    counterparty_name: str   = ""
    amount:            float = 0.0
    schedule_type:     str          # interval_minutes | interval_days | monthly_days | weekly_days
    schedule_config:   dict
    description:       str   = ""
    is_active:         bool  = True
    is_posted:         bool  = False
    delivery_channel:  Optional[str] = None   # TG | EMAIL | INTERNAL | EDO
    delivery_address:  Optional[str] = None   # TG chat_id, email address, etc.
    message:           Optional[str] = None   # Optional message sent with invoice


class DocScheduleUpdate(BaseModel):
    schedule_type:    Optional[str]  = None
    schedule_config:  Optional[dict] = None
    description:      Optional[str]  = None
    is_active:        Optional[bool] = None
    is_posted:        Optional[bool] = None
    delivery_channel: Optional[str]  = None
    delivery_address: Optional[str]  = None
    message:          Optional[str]  = None


class DocScheduleOut(BaseModel):
    id:               int
    tenant_id:        int
    document_ref_key: str
    document_number:  str
    counterparty_key: str
    counterparty_name: str
    amount:           float
    schedule_type:    str
    schedule_config:  Any
    description:      str
    is_active:        bool
    is_posted:        bool
    delivery_channel: Optional[str]
    delivery_address: Optional[str]
    message:          Optional[str]
    next_run:         Optional[datetime]
    last_run:         Optional[datetime]
    run_count:        int
    error_count:      int
    last_error:       Optional[str]
    last_delivery_ok: Optional[bool]
    last_delivery_at: Optional[datetime]
    created_at:       datetime

    @field_validator("schedule_config", mode="before")
    @classmethod
    def parse_config(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = ConfigDict(from_attributes=True)
