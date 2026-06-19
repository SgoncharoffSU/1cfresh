from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


class RegisterIn(BaseModel):
    firm_name: str
    firm_inn:  Optional[str] = None
    name:      str
    email:     str
    password:  str

    @field_validator("password")
    @classmethod
    def pw_len(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен быть не менее 6 символов")
        return v


class LoginIn(BaseModel):
    email:    str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    firm_id:      int
    tenant_id:    Optional[int]
    name:         str
    email:        str
    role:         str


class UserOut(BaseModel):
    id:        int
    firm_id:   int
    tenant_id: Optional[int]
    name:      str
    email:     str
    role:      str
    firm_name: str
    firm_inn:  Optional[str]
    firm_plan: str

    model_config = {"from_attributes": True}


class TenantSetupIn(BaseModel):
    odata_url:      str
    odata_login:    str
    odata_password: str


class TenantSetupOut(BaseModel):
    tenant_id: int
    name:      str
    odata_url: str
    connected: bool
