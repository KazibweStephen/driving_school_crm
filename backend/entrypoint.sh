#!/bin/bash
set -e

echo "Running database migrations..."
PYTHONPATH=/app alembic upgrade heads

echo "Running seed data..."
python -m app.seed

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
