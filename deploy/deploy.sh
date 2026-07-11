#!/usr/bin/env bash
set -euo pipefail

# Production deployment script for Driving School CRM on DigitalOcean.
# Run from the project root on the droplet.

COMPOSE_FILE="docker-compose.prod.yml"

# Verify required env vars
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

if [ ! -f "./backend/.env.prod" ]; then
    echo "ERROR: backend/.env.prod not found. Copy backend/.env.prod.example to backend/.env.prod and fill in production secrets."
    exit 1
fi

# Load backend environment variables for use by docker compose
set -a
source ./backend/.env.prod
set +a

echo "=== Pulling latest code ==="
git pull origin main || true

echo "=== Checking for port conflicts on 80/443 ==="
for port in 80 443; do
    if ss -tlnp | grep -q ":$port "; then
        echo "WARNING: port $port is already in use on the host. Stopping host nginx if running..."
        systemctl stop nginx || true
        systemctl disable nginx || true
        if ss -tlnp | grep -q ":$port "; then
            echo "ERROR: port $port is still in use. Identify the process with: sudo ss -tlnp | grep ':$port'"
            exit 1
        fi
    fi
done

echo "=== Building and starting services ==="
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --build

echo "=== Running database migrations ==="
sleep 5
docker compose -f "$COMPOSE_FILE" exec -T backend bash -c 'PYTHONPATH=/app alembic upgrade head'

echo "=== Seeding default data (safe to re-run) ==="
docker compose -f "$COMPOSE_FILE" exec -T backend bash -c 'PYTHONPATH=/app python app/seed.py' || true

echo "=== Restarting frontend to pick up latest build ==="
docker compose -f "$COMPOSE_FILE" restart frontend

echo "=== Pruning old images ==="
docker image prune -af --filter "until=168h" || true

echo "=== Deployment complete ==="
docker compose -f "$COMPOSE_FILE" ps
