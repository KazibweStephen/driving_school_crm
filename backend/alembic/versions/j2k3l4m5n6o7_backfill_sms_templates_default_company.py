"""Backfill SMS templates for default company

Revision ID: j2k3l4m5n6o7
Revises: i1j2k3l4m5n6
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

revision = "j2k3l4m5n6o7"
down_revision = "i1j2k3l4m5n6"
branch_labels = None
depends_on = None

DEFAULT_COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

DEFAULT_TEMPLATES = {
    "user_created": {
        "name": "PIN Creation",
        "category": "pin_creation_reset",
        "body": "Dear {name},\n\nYour account has been created. Your PIN is: {pin}\nPlease keep it safe.\n\nDrive Safe!",
    },
    "pin_reset": {
        "name": "PIN Reset",
        "category": "pin_creation_reset",
        "body": "Dear {name},\n\nYour PIN has been reset. Your new PIN is: {pin}\nPlease keep it safe.\n\nDrive Safe!",
    },
    "consultation_created": {
        "name": "Welcome Message",
        "category": "branch_visit",
        "body": "Welcome to Driving School, {name}!\n\nWe're excited to have you on board.\nWe'll be in touch shortly.\n\nDrive Safe!",
    },
    "payment_received": {
        "name": "Payment Receipt",
        "category": "payment_receipt",
        "body": "Dear {name},\n\nThank you for your payment of {amount}.\nReceipt: {receipt_number}\n\n{download_url}\n\nDrive Safe!",
    },
    "installment_due": {
        "name": "Installment Reminder",
        "category": "payment_installment",
        "body": "Dear {name},\n\nReminder: Installment of {amount} is due on {due_date}.\nOutstanding balance: {balance}\n\nPlease make payment to avoid interruption.\nThank you!",
    },
    "installment_overdue": {
        "name": "Overdue Payment Notice",
        "category": "payment_installment",
        "body": "Dear {name},\n\nFriendly reminder: Your payment of {overdue_amount} is {days_overdue} day(s) overdue.\nTotal outstanding: {total_balance}\n\nPlease clear the balance to continue your training.\nContact us for payment options.",
    },
    "expense_approved": {
        "name": "Expense Approved",
        "category": "general",
        "body": "Dear {name},\n\nYour expense request '{description}' for {amount} has been approved.\nFinance will process the payment shortly.\n\nThank you.",
    },
    "lesson_scheduled": {
        "name": "Lesson Scheduled",
        "category": "lesson_scheduling",
        "body": "Dear {name},\n\nYour lesson has been scheduled.\nDate: {date}\nTime: {time}\nInstructor: {instructor}\n\nPlease be on time.",
    },
    "lesson_cancelled": {
        "name": "Lesson Cancelled",
        "category": "training_cancellation",
        "body": "Dear {name},\n\nYour lesson on {date} at {time} has been cancelled.\nReason: {reason}\n\nWe'll reschedule shortly.",
    },
    "lesson_reminder": {
        "name": "Lesson Reminder",
        "category": "lesson_reminder",
        "body": "Dear {name},\n\nReminder: You have a lesson tomorrow.\nDate: {date}\nTime: {time}\nInstructor: {instructor}\n\nSee you there!",
    },
    "permit_expiring": {
        "name": "Permit Expiring Soon",
        "category": "permit_expiring",
        "body": "Dear {name},\n\nYour permit is expiring on {expiry_date} ({days_remaining} days remaining).\nPlease renew to avoid interruption.\n\nDrive Safe!",
    },
    "cart_item_converted": {
        "name": "Conversion Notification",
        "category": "general",
        "body": "Dear {name},\n\nCongratulations! Your registration is complete.\nPackage: {package}\nAmount: {amount}\n\nWe'll contact you shortly to schedule your first lesson.\n\nDrive Safe!",
    },
    "training_completed": {
        "name": "Training Completed",
        "category": "general",
        "body": "Dear {name},\n\nCongratulations! You have completed your {package} training.\nTotal sessions: {total_sessions}\n\nPlease contact us for your next steps.\n\nDrive Safe!",
    },
}


def upgrade() -> None:
    conn = op.get_bind()

    existing = conn.execute(
        sa.text("SELECT trigger_event FROM sms_templates WHERE company_id = :cid"),
        {"cid": str(DEFAULT_COMPANY_ID)},
    ).fetchall()
    existing_triggers = {row[0] for row in existing}

    for trigger_event, tmpl in DEFAULT_TEMPLATES.items():
        if trigger_event in existing_triggers:
            continue
        conn.execute(
            sa.text(
                """INSERT INTO sms_templates (id, company_id, name, category, trigger_event, body, is_active, created_at, updated_at)
                   VALUES (:id, :company_id, :name, :category, :trigger_event, :body, true, NOW(), NOW())"""
            ),
            {
                "id": str(uuid.uuid4()),
                "company_id": str(DEFAULT_COMPANY_ID),
                "name": tmpl["name"],
                "category": tmpl["category"],
                "trigger_event": trigger_event,
                "body": tmpl["body"],
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM sms_templates WHERE company_id = :cid"),
        {"cid": str(DEFAULT_COMPANY_ID)},
    )
