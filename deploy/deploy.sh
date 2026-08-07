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

# Backend env file (gitignored). Prefer values already exported in the shell
# environment; fall back to backend/.env.prod if it exists.
if [ -f "./backend/.env.prod" ]; then
    set -a
    source ./backend/.env.prod
    set +a
fi

# Critical vars must resolve (from the shell environment or backend/.env.prod)
: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

# If backend/.env.prod is missing, generate it from the environment so that
# docker compose (env_file) keeps working. Only generated when absent — the
# file persists on the droplet afterwards, so you don't have to recreate it
# after every pull. Export these vars once (e.g. in ~/.bashrc) to avoid
# maintaining the file at all.
if [ ! -f "./backend/.env.prod" ]; then
    echo "=== backend/.env.prod not found — generating from environment variables ==="
    cat > "./backend/.env.prod" <<EOF
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_HOST=${POSTGRES_HOST:-postgres}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
JWT_SECRET_KEY=${JWT_SECRET_KEY:-$(openssl rand -hex 32)}
JWT_ALGORITHM=${JWT_ALGORITHM:-HS256}
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=${JWT_ACCESS_TOKEN_EXPIRE_MINUTES:-60}
JWT_REFRESH_TOKEN_EXPIRE_DAYS=${JWT_REFRESH_TOKEN_EXPIRE_DAYS:-7}
CORS_ORIGINS=${CORS_ORIGINS:-}
RECEIPT_BASE_URL=${RECEIPT_BASE_URL:-}
APP_URL=${APP_URL:-}
APP_NAME=${APP_NAME:-Driving School CRM}
DEBUG=${DEBUG:-false}
EOF
    echo "Generated backend/.env.prod. Review CORS_ORIGINS / RECEIPT_BASE_URL / APP_URL (export them, or edit the file)."
fi

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
