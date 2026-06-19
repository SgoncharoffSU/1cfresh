import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from app.main import app

TEST_DB_URL = "postgresql+asyncpg://user:password@localhost:5432/invoices_test"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


INVOICE_PAYLOAD = {
    "number": "TEST-001",
    "client_name": "ООО Тестовая Компания",
    "client_inn": "7700000000",
    "client_email": "client@example.com",
    "amount": 12000.0,
    "vat_rate": 20.0,
    "items": [
        {"name": "Услуга разработки", "quantity": 10, "unit": "час", "price": 1000.0, "vat_rate": 20.0},
        {"name": "Лицензия ПО", "quantity": 1, "unit": "шт", "price": 2000.0, "vat_rate": 20.0},
    ],
}


@pytest.mark.asyncio
async def test_create_invoice(client: AsyncClient):
    r = await client.post("/api/v1/invoices/", json=INVOICE_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["number"] == "TEST-001"
    assert data["status"] == "draft"
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_get_invoice(client: AsyncClient):
    create_r = await client.post("/api/v1/invoices/", json=INVOICE_PAYLOAD)
    invoice_id = create_r.json()["id"]

    r = await client.get(f"/api/v1/invoices/{invoice_id}")
    assert r.status_code == 200
    assert r.json()["id"] == invoice_id


@pytest.mark.asyncio
async def test_list_invoices(client: AsyncClient):
    await client.post("/api/v1/invoices/", json=INVOICE_PAYLOAD)
    second = {**INVOICE_PAYLOAD, "number": "TEST-002"}
    await client.post("/api/v1/invoices/", json=second)

    r = await client.get("/api/v1/invoices/")
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_update_invoice(client: AsyncClient):
    invoice_id = (await client.post("/api/v1/invoices/", json=INVOICE_PAYLOAD)).json()["id"]
    r = await client.patch(f"/api/v1/invoices/{invoice_id}", json={"client_name": "Новое Имя"})
    assert r.status_code == 200
    assert r.json()["client_name"] == "Новое Имя"


@pytest.mark.asyncio
async def test_delete_invoice(client: AsyncClient):
    invoice_id = (await client.post("/api/v1/invoices/", json=INVOICE_PAYLOAD)).json()["id"]
    r = await client.delete(f"/api/v1/invoices/{invoice_id}")
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/invoices/{invoice_id}")
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_404_on_missing_invoice(client: AsyncClient):
    r = await client.get("/api/v1/invoices/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_schedule(client: AsyncClient):
    payload = {
        "name": "Ежемесячный счет",
        "cron_expression": "0 9 1 * *",
        "template_data": {
            "number_prefix": "MONTHLY",
            "client_name": "ООО Клиент",
            "client_inn": "7700000001",
            "client_email": "client@example.com",
            "amount": 5000.0,
            "vat_rate": 20.0,
            "items": [{"name": "Абонентская плата", "quantity": 1, "unit": "шт", "price": 5000.0, "vat_rate": 20.0}],
        },
    }
    r = await client.post("/api/v1/schedules/", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Ежемесячный счет"
    assert data["is_active"] is True
    assert data["next_run"] is not None


@pytest.mark.asyncio
async def test_invalid_cron(client: AsyncClient):
    r = await client.post(
        "/api/v1/schedules/",
        json={"name": "Bad", "cron_expression": "not-a-cron", "template_data": {}},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_toggle_schedule(client: AsyncClient):
    create_r = await client.post(
        "/api/v1/schedules/",
        json={
            "name": "Toggle test",
            "cron_expression": "0 8 * * 1",
            "template_data": {"number_prefix": "T"},
        },
    )
    sid = create_r.json()["id"]

    r = await client.patch(f"/api/v1/schedules/{sid}/toggle")
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r2 = await client.patch(f"/api/v1/schedules/{sid}/toggle")
    assert r2.json()["is_active"] is True


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
