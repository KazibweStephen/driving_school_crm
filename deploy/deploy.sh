#!/usr/bin/env bash
set -euo pipefail

# Production deployment script for Driving School CRM on DigitalOcean.
# Run from the project root on the droplet.

COMPOSE_FILE="docker-compose.prod.yml"

# Optional target service. Usage:
#   ./deploy/deploy.sh            full deployment (build & restart all services)
#   ./deploy/deploy.sh frontend   rebuild & restart only the frontend
#   ./deploy/deploy.sh backend    rebuild & restart only the backend
SERVICE="${1:-}"
if [ -n "$SERVICE" ] && [ "$SERVICE" != "frontend" ] && [ "$SERVICE" != "backend" ]; then
    echo "Usage: $0 [frontend|backend]"
    echo "  (no argument)  full deployment (build & restart all services)"
    echo "  frontend       rebuild & restart only the frontend"
    echo "  backend        rebuild & restart only the backend"
    exit 1
fi

# Verify required env vars
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

if [ ! -f "./backend/.env.prod" ]; then
    echo "ERROR: backend/.env.prod not found. Copy backend/.env.prod.example to backend/.env.prod and fill in production secrets."
    exit 1
fi

# Validate .env.prod has the critical postgres vars
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
    if ! grep -qE "^${var}=.+" ./backend/.env.prod; then
        echo "ERROR: $var is missing or empty in backend/.env.prod"
        exit 1
    fi
done

# Load backend environment variables for use by docker compose
set -a
source ./backend/.env.prod
set +a

echo "=== Pulling latest code ==="
git pull origin main || true

# Port 80 is only needed by the frontend. Only stop host nginx when the
# frontend is being (re)deployed, to avoid clobbering it for backend-only deploys.
if [ -z "$SERVICE" ] || [ "$SERVICE" = "frontend" ]; then
    echo "=== Checking for port conflicts on 80 ==="
    for port in 80; do
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
fi

if [ -n "$SERVICE" ]; then
    echo "=== Building $SERVICE ==="
    docker compose -f "$COMPOSE_FILE" build "$SERVICE"
    echo "=== Recreating $SERVICE ==="
    docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
else
    echo "=== Building and starting services ==="
    docker compose -f "$COMPOSE_FILE" pull
    docker compose -f "$COMPOSE_FILE" up -d --build
fi

if [ -z "$SERVICE" ] || [ "$SERVICE" = "backend" ]; then
    echo "=== Waiting for backend to be healthy ==="
    MAX_WAIT=60
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if docker compose -f "$COMPOSE_FILE" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" 2>/dev/null; then
            echo "Backend is healthy after ${WAITED}s"
            break
        fi
        sleep 2
        WAITED=$((WAITED + 2))
    done
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "WARNING: Backend health check timed out after ${MAX_WAIT}s. Proceeding anyway..."
    fi

    echo "=== Running database migrations ==="
    docker compose -f "$COMPOSE_FILE" exec -T -e PYTHONPATH=/app backend alembic upgrade head

    echo "=== Seeding default data (safe to re-run) ==="
    docker compose -f "$COMPOSE_FILE" exec -T -e PYTHONPATH=/app backend python -m app.seed || true
fi

if [ -z "$SERVICE" ]; then
    echo "=== Restarting frontend to pick up latest build ==="
    docker compose -f "$COMPOSE_FILE" restart frontend
fi

echo "=== Pruning old images ==="
docker image prune -af --filter "until=168h" || true

echo "=== Deployment complete ==="
docker compose -f "$COMPOSE_FILE" ps
