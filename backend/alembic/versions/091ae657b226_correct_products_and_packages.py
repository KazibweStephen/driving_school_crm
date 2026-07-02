"""correct_products_and_packages

Revision ID: 091ae657b226
Revises: 616ea99ab197
Create Date: 2026-06-13 19:22:34.681727

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '091ae657b226'
down_revision: Union[str, None] = '616ea99ab197'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('package_items')
    op.drop_table('packages')
    op.drop_table('products')

    op.execute("DROP TYPE IF EXISTS packagestatus")
    op.execute("DROP TYPE IF EXISTS productstatus")
    op.execute("DROP TYPE IF EXISTS productcategory")

    op.create_table('products',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('duration_label', sa.String(length=100), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', name='entitystatus'), nullable=False),
    sa.Column('created_by_phone', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_phone'], ['users.phone'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('packages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('product_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('duration_label', sa.String(length=100), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', name='entitystatus', create_type=False), nullable=False),
    sa.Column('created_by_phone', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_phone'], ['users.phone'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('packages')
    op.drop_table('products')
    op.execute("DROP TYPE IF EXISTS entitystatus")

    op.create_table('products',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('category', sa.Enum('LESSON', 'THEORY', 'TEST', 'OTHER', name='productcategory'), nullable=False),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('duration_minutes', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', name='productstatus'), nullable=False),
    sa.Column('created_by_phone', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_phone'], ['users.phone'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('packages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('total_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', name='packagestatus'), nullable=False),
    sa.Column('created_by_phone', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_phone'], ['users.phone'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('package_items',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('package_id', sa.UUID(), nullable=False),
    sa.Column('product_id', sa.UUID(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['package_id'], ['packages.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
