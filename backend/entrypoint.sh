#!/bin/bash
set -e

echo "Running database migrations..."
PYTHONPATH=/app alembic upgrade heads || echo "WARNING: Alembic migration failed (may be pre-existing cycle). Continuing startup..."

echo "Running seed data..."
python -m app.seed || echo "WARNING: Seed script failed. Continuing startup..."

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
