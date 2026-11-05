"""Add youth policy condition codes: 온통청년 employment, marriage, education and income condition codes for matching.

Revision ID: 20261105_0021
Revises: 20261105_0020
Create Date: 2026-11-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261105_0021"
down_revision: str | Sequence[str] | None = "20261105_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = (("job_codes", 120), ("marriage_code", 40), ("school_codes", 120), ("income_condition", 20))


def upgrade() -> None:
    for name, length in COLUMNS:
        op.add_column("youth_policies", sa.Column(name, sa.String(length=length), nullable=False, server_default=""))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("youth_policies", name)
