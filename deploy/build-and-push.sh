#!/usr/bin/env bash
set -euo pipefail

# Build and push production images to Docker Hub.
# Run from the project root.
#
# Usage:
#   ./deploy/build-and-push.sh              # builds :latest
#   ./deploy/build-and-push.sh v1.2.3       # builds :v1.2.3
#   ./deploy/build-and-push.sh latest v1.2.3 # builds both tags

DOCKER_PREFIX="${DOCKER_IMAGE_PREFIX:-kstephen3}"
REGISTRY="${DOCKER_REGISTRY:-docker.io}"

tags=("${@:-latest}")

echo "=== Logging in to Docker Hub ==="
docker login "$REGISTRY"

echo "=== Building backend ==="
backend_tags=()
for tag in "${tags[@]}"; do
    backend_tags+=("-t" "${REGISTRY}/${DOCKER_PREFIX}/crm_backend:${tag}")
done
docker build "${backend_tags[@]}" ./backend

echo "=== Building frontend ==="
frontend_tags=()
for tag in "${tags[@]}"; do
    frontend_tags+=("-t" "${REGISTRY}/${DOCKER_PREFIX}/crm_frontend:${tag}")
done
docker build "${frontend_tags[@]}" ./frontend

echo "=== Pushing backend ==="
for tag in "${tags[@]}"; do
    docker push "${REGISTRY}/${DOCKER_PREFIX}/crm_backend:${tag}"
done

echo "=== Pushing frontend ==="
for tag in "${tags[@]}"; do
    docker push "${REGISTRY}/${DOCKER_PREFIX}/crm_frontend:${tag}"
done

echo "=== Done ==="
echo "Backend images:"
for tag in "${tags[@]}"; do
    echo "  ${REGISTRY}/${DOCKER_PREFIX}/crm_backend:${tag}"
done
echo "Frontend images:"
for tag in "${tags[@]}"; do
    echo "  ${REGISTRY}/${DOCKER_PREFIX}/crm_frontend:${tag}"
done
