from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SuperAdminLoginIn(BaseModel):
    email:    str
    password: str


class SuperAdminTokenOut(BaseModel):
    access_token:    str
    token_type:      str = "bearer"
    superadmin_id:   int
    name:            str
    email:           str


class FirmSummaryOut(BaseModel):
    id:                  int
    name:                str
    inn:                 Optional[str]
    is_active:           bool
    subscription_status: str
    subscription_plan:   Optional[str]
    user_count:          int
    created_at:          datetime


class FirmUserOut(BaseModel):
    id:    int
    name:  str
    email: str
    role:  str

    model_config = {"from_attributes": True}


class FirmDetailOut(BaseModel):
    firm:  FirmSummaryOut
    users: list[FirmUserOut]


class ImpersonateIn(BaseModel):
    target_user_id: Optional[int] = None


class ImpersonateOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    firm_id:      int
    user_id:      int
    redirect:     str


class AuditLogOut(BaseModel):
    id:               int
    superadmin_name:  str
    firm_id:          int
    firm_name:        str
    target_user_name: str
    started_at:       datetime
