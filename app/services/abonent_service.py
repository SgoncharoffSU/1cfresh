"""Atomic per-tenant abonent numbering (client_contacts.abonent_number)."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_abonent_number(db: AsyncSession, tenant_id: int) -> int:
    """Atomically increment and return the next abonent_number for this tenant.

    A plain SELECT MAX(abonent_number)+1 races when a tenant has zero rows yet
    (nothing to lock), so two concurrent first-client creates could both get 1.
    A dedicated counter row with ON DUPLICATE KEY UPDATE is atomic per-row in MySQL.
    """
    await db.execute(
        text(
            "INSERT INTO abonent_counters (tenant_id, last_number) VALUES (:t, 1) "
            "ON DUPLICATE KEY UPDATE last_number = last_number + 1"
        ),
        {"t": tenant_id},
    )
    row = await db.execute(
        text("SELECT last_number FROM abonent_counters WHERE tenant_id = :t"),
        {"t": tenant_id},
    )
    return row.scalar_one()
