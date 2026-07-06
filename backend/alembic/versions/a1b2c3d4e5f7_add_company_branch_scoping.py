"""Add company, branch, company/branch scoping

Revision ID: a1b2c3d4e5f7
Revises: 253982fdb287
Create Date: 2026-07-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "253982fdb287"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Create companies table ──
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    # ── Create branches table ──
    op.create_table(
        "branches",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_branches_company_id"), "branches", ["company_id"])

    # ── Create user_branch_assignments table ──
    op.create_table(
        "user_branch_assignments",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("user_id", sa.String(20), sa.ForeignKey("users.phone", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_branch_assignments_user_id"), "user_branch_assignments", ["user_id"])
    op.create_index(op.f("ix_user_branch_assignments_branch_id"), "user_branch_assignments", ["branch_id"])

    # ── Create vehicle_branch_assignments table ──
    op.create_table(
        "vehicle_branch_assignments",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vehicle_branch_assignments_vehicle_id"), "vehicle_branch_assignments", ["vehicle_id"])
    op.create_index(op.f("ix_vehicle_branch_assignments_branch_id"), "vehicle_branch_assignments", ["branch_id"])

    # ── Create expenses table ──
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("expense_date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_expenses_branch_id"), "expenses", ["branch_id"])

    # ── Create sales table ──
    op.create_table(
        "sales",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("consultation_id", postgresql.UUID(), sa.ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sale_date", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by_phone", sa.String(20), sa.ForeignKey("users.phone"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sales_branch_id"), "sales", ["branch_id"])

    # ── Add company_id to existing tables ──
    op.add_column("users", sa.Column("is_company_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True))
    op.create_index(op.f("ix_users_company_id"), "users", ["company_id"])

    op.add_column("products", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.create_index(op.f("ix_products_company_id"), "products", ["company_id"])

    op.add_column("vehicles", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.create_index(op.f("ix_vehicles_company_id"), "vehicles", ["company_id"])

    op.add_column("lesson_plan_templates", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.create_index(op.f("ix_lesson_plan_templates_company_id"), "lesson_plan_templates", ["company_id"])

    op.add_column("lesson_library", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.create_index(op.f("ix_lesson_library_company_id"), "lesson_library", ["company_id"])

    op.add_column("video_library", sa.Column("company_id", postgresql.UUID(), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True))
    op.create_index(op.f("ix_video_library_company_id"), "video_library", ["company_id"])

    # ── Add branch_id to existing tables ──
    op.add_column("consultations", sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True))
    op.create_index(op.f("ix_consultations_branch_id"), "consultations", ["branch_id"])

    op.add_column("client_availabilities", sa.Column("branch_id", postgresql.UUID(), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True))
    op.create_index(op.f("ix_client_availabilities_branch_id"), "client_availabilities", ["branch_id"])

    # ── Seed: Create default company and branch, assign existing records ──
    conn = op.get_bind()

    # Extend userrole enum with missing values
    for val in ["MANAGER", "RECEPTION"]:
        conn.execute(sa.text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{val}'"))

    # Create default company
    default_company_id = "00000000-0000-0000-0000-000000000001"
    conn.execute(
        sa.text(
            "INSERT INTO companies (id, name, code, is_active) "
            "VALUES (:id, :name, :code, true) ON CONFLICT (code) DO NOTHING"
        ),
        {"id": default_company_id, "name": "Default Company", "code": "default"},
    )

    # Create default branch
    default_branch_id = "00000000-0000-0000-0000-000000000002"
    conn.execute(
        sa.text(
            "INSERT INTO branches (id, company_id, name, code, is_active) "
            "VALUES (:id, :company_id, :name, :code, true) ON CONFLICT (code) DO NOTHING"
        ),
        {"id": default_branch_id, "company_id": default_company_id, "name": "Main Branch", "code": "main"},
    )

    # Backfill company_id on products
    conn.execute(
        sa.text("UPDATE products SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )

    # Backfill company_id on vehicles
    conn.execute(
        sa.text("UPDATE vehicles SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )

    # Backfill company_id on lesson_plan_templates
    conn.execute(
        sa.text("UPDATE lesson_plan_templates SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )

    # Backfill company_id on lesson_library
    conn.execute(
        sa.text("UPDATE lesson_library SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )

    # Backfill company_id on video_library
    conn.execute(
        sa.text("UPDATE video_library SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )

    # Backfill branch_id on consultations
    conn.execute(
        sa.text("UPDATE consultations SET branch_id = :branch_id WHERE branch_id IS NULL"),
        {"branch_id": default_branch_id},
    )

    # Backfill branch_id on client_availabilities
    conn.execute(
        sa.text("UPDATE client_availabilities SET branch_id = :branch_id WHERE branch_id IS NULL"),
        {"branch_id": default_branch_id},
    )

    # Assign users to default company
    conn.execute(
        sa.text("UPDATE users SET company_id = :company_id WHERE company_id IS NULL"),
        {"company_id": default_company_id},
    )


def downgrade() -> None:
    # Drop added columns (order matters: drop FK-referenced columns after tables referencing them)
    op.drop_index(op.f("ix_client_availabilities_branch_id"), table_name="client_availabilities")
    op.drop_column("client_availabilities", "branch_id")

    op.drop_index(op.f("ix_consultations_branch_id"), table_name="consultations")
    op.drop_column("consultations", "branch_id")

    op.drop_index(op.f("ix_video_library_company_id"), table_name="video_library")
    op.drop_column("video_library", "company_id")

    op.drop_index(op.f("ix_lesson_library_company_id"), table_name="lesson_library")
    op.drop_column("lesson_library", "company_id")

    op.drop_index(op.f("ix_lesson_plan_templates_company_id"), table_name="lesson_plan_templates")
    op.drop_column("lesson_plan_templates", "company_id")

    op.drop_index(op.f("ix_vehicles_company_id"), table_name="vehicles")
    op.drop_column("vehicles", "company_id")

    op.drop_index(op.f("ix_products_company_id"), table_name="products")
    op.drop_column("products", "company_id")

    op.drop_index(op.f("ix_users_company_id"), table_name="users")
    op.drop_column("users", "company_id")
    op.drop_column("users", "is_company_admin")

    # Drop tables
    op.drop_table("sales")
    op.drop_table("expenses")
    op.drop_table("vehicle_branch_assignments")
    op.drop_table("user_branch_assignments")

    op.drop_table("branches")
    op.drop_table("companies")
