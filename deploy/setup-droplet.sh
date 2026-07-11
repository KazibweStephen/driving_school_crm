#!/usr/bin/env bash
set -euo pipefail

# DigitalOcean Droplet initial setup script for Driving School CRM
# Run as root on a fresh Ubuntu 24.04 LTS droplet.

APP_DIR="/opt/driving-school-crm"
REPO_URL="${REPO_URL:-}"

echo "=== Updating system ==="
apt-get update
apt-get upgrade -y

echo "=== Installing dependencies ==="
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx \
    ufw \
    fail2ban \
    certbot \
    python3-certbot-nginx

echo "=== Installing Docker ==="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Creating app user ==="
if ! id -u crm >/dev/null 2>&1; then
    useradd -m -s /bin/bash crm
fi
usermod -aG docker crm

echo "=== Creating app directory ==="
mkdir -p "$APP_DIR"
chown -R crm:crm "$APP_DIR"

echo "=== Cloning repository ==="
if [ -n "$REPO_URL" ]; then
    sudo -u crm git clone "$REPO_URL" "$APP_DIR/repo"
else
    echo "WARNING: REPO_URL is not set. Please clone your repository into $APP_DIR/repo manually."
fi

echo "=== Configuring UFW ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "=== Enabling fail2ban ==="
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Clone or copy your project into $APP_DIR/repo"
echo "  2. Copy backend/.env.prod.example to backend/.env.prod and fill in secrets"
echo "  3. Copy docker-compose.prod.yml env values or set them in /etc/environment"
echo "  4. Run: cd $APP_DIR/repo && ./deploy/deploy.sh"
