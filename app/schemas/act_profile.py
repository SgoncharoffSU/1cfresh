from typing import Optional

from pydantic import BaseModel


class ActProfileOut(BaseModel):
    podryadchik_address: Optional[str] = None
    podryadchik_phone:   Optional[str] = None
    podryadchik_okpo:    Optional[str] = None
    zakazchik_address:   Optional[str] = None
    zakazchik_phone:     Optional[str] = None
    zakazchik_okpo:      Optional[str] = None
    investor_name:       Optional[str] = None
    investor_address:    Optional[str] = None
    investor_okpo:       Optional[str] = None
    stroika_name:        Optional[str] = None
    okdp:                Optional[str] = None

    model_config = {"from_attributes": True}


class ActProfileIn(BaseModel):
    podryadchik_address: Optional[str] = None
    podryadchik_phone:   Optional[str] = None
    podryadchik_okpo:    Optional[str] = None
    zakazchik_address:   Optional[str] = None
    zakazchik_phone:     Optional[str] = None
    zakazchik_okpo:      Optional[str] = None
    investor_name:       Optional[str] = None
    investor_address:    Optional[str] = None
    investor_okpo:       Optional[str] = None
    stroika_name:        Optional[str] = None
    okdp:                Optional[str] = None
