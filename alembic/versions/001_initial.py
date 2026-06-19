"""initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00
"""

import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("client_name", sa.String(200), nullable=False),
        sa.Column("client_inn", sa.String(12), nullable=False),
        sa.Column("client_email", sa.String(200), nullable=False),
        sa.Column("client_diadoc_id", sa.String(100), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("vat_rate", sa.Float(), nullable=False, server_default="20.0"),
        sa.Column("onec_guid", sa.String(100), nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "sent_to_1c", "pdf_received", "email_sent", "edo_sent", "completed", "failed"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number"),
    )
    op.create_index("ix_invoices_id", "invoices", ["id"])
    op.create_index("ix_invoices_number", "invoices", ["number"])

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(50), nullable=False, server_default="шт"),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("vat_rate", sa.Float(), nullable=False, server_default="20.0"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invoice_items_id", "invoice_items", ["id"])

    op.create_table(
        "recurring_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("template_data", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("last_run", sa.DateTime(), nullable=True),
        sa.Column("next_run", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recurring_schedules_id", "recurring_schedules", ["id"])


def downgrade() -> None:
    op.drop_table("recurring_schedules")
    op.drop_table("invoice_items")
    op.drop_table("invoices")
