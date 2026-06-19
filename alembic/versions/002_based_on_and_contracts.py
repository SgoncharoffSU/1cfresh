"""Add based_on_type, source_doc_type to schedules; FACTURA/CONTRACT doc_type support

Revision ID: 002
Revises: 001
Create Date: 2025-01-01 00:00:00
"""

import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("document_schedules") as batch:
        batch.add_column(sa.Column("source_doc_type", sa.String(20), nullable=False, server_default="INVOICE"))
        batch.add_column(sa.Column("based_on_type",   sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("document_schedules") as batch:
        batch.drop_column("based_on_type")
        batch.drop_column("source_doc_type")
