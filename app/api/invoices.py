from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceUpdate
from app.services import invoice_service
from app.tasks.invoice_tasks import process_invoice_task

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("/", response_model=List[InvoiceResponse])
async def list_invoices(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    return await invoice_service.get_invoices(db, skip=skip, limit=limit)


@router.post("/", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(data: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    return await invoice_service.create_invoice(db, data)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: int, db: AsyncSession = Depends(get_db)):
    invoice = await invoice_service.get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.patch("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(invoice_id: int, data: InvoiceUpdate, db: AsyncSession = Depends(get_db)):
    invoice = await invoice_service.update_invoice(db, invoice_id, data)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(invoice_id: int, db: AsyncSession = Depends(get_db)):
    deleted = await invoice_service.delete_invoice(db, invoice_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Invoice not found")


@router.post("/{invoice_id}/process", response_model=InvoiceResponse)
async def process_invoice_async(invoice_id: int, db: AsyncSession = Depends(get_db)):
    """Enqueue full processing cycle via Celery (async)."""
    invoice = await invoice_service.get_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    process_invoice_task.delay(invoice_id)
    return invoice


@router.post("/{invoice_id}/process/sync", response_model=InvoiceResponse)
async def process_invoice_sync(invoice_id: int, db: AsyncSession = Depends(get_db)):
    """Run full processing cycle synchronously (blocks until done)."""
    try:
        return await invoice_service.process_invoice_full_cycle(db, invoice_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
