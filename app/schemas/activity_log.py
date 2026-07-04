from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ActivityLogOut(BaseModel):
    id:          int
    created_at:  datetime
    actor_type:  str
    actor_id:    Optional[int]
    actor_name:  Optional[str]
    firm_id:     Optional[int]
    firm_name:   Optional[str] = None
    action:      str
    description: str
    entity_type: Optional[str]
    entity_id:   Optional[str]


class ActivityLogListOut(BaseModel):
    items: list[ActivityLogOut]
    total: int
