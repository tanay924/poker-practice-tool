"""Create the initial poker trainer schema.

This baseline deliberately uses the SQLAlchemy metadata as the single source
for the initial fresh database. Future revisions should use explicit reviewed
Alembic operations and must not rely on application startup mutation.
"""

from typing import Sequence, Union

from alembic import op

from app.db import Base
import app.models  # noqa: F401

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
