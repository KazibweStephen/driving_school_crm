# Deploying Driving School CRM to DigitalOcean

This guide covers deploying the CRM to a DigitalOcean droplet using Docker Compose, Nginx, and optional SSL via Let's Encrypt.

---

## What gets deployed

| Service | Container | Exposed port | Notes |
|---------|-----------|--------------|-------|
| PostgreSQL | `crm-postgres` | Internal only | Persistent volume |
| FastAPI backend | `crm-backend` | Internal only | Proxied by Nginx |
| Angular frontend | `crm-frontend` | `80`, `443` | Nginx serves static build |
| Certbot | `crm-certbot` | — | Auto-renews SSL certificates |

---

## 1. Create a DigitalOcean droplet

Recommended spec for production:

- **OS:** Ubuntu 24.04 (LTS)
- **Plan:** Basic (or General Purpose) with at least **2 vCPU / 4 GB RAM / 80 GB SSD**
- **Region:** Closest to your users
- **SSH keys:** Add your SSH key for secure access
- **Firewall:** Enable DigitalOcean Cloud Firewall with:
  - SSH (22) from your IP
  - HTTP (80) from anywhere
  - HTTPS (443) from anywhere

Point your domain's A record to the droplet's public IPv4 address.

---

## 2. Initial droplet setup

SSH into the droplet as root and run the setup script:

```bash
# Option A: clone this repo and run the script
ssh root@YOUR_DROPLET_IP
git clone https://github.com/YOUR_ORG/driving_school_crm_2.git /opt/driving-school-crm/repo
cd /opt/driving-school-crm/repo
chmod +x deploy/setup-droplet.sh
./deploy/setup-droplet.sh
```

The script installs Docker, Docker Compose, Nginx, Certbot, fail2ban, UFW, and creates a `crm` user.

---

## 3. Configure production environment

Create the backend production env file:

```bash
cp backend/.env.prod.example backend/.env.prod
nano backend/.env.prod
```

Set strong values for at least:

```ini
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=crm_db
JWT_SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=["https://your-domain.com"]
RECEIPT_BASE_URL=https://your-domain.com
APP_URL=https://your-domain.com
DEBUG=false
```

Export Docker Compose database variables:

```bash
export POSTGRES_USER=crm_user
export POSTGRES_PASSWORD=<same-strong-password>
export POSTGRES_DB=crm_db
```

To persist these across reboots, add them to `/opt/driving-school-crm/repo/.env` or `/etc/environment`.

---

## 4. First deploy (HTTP)

The provided `frontend/nginx.prod.conf` initially serves the app over HTTP so you can verify everything works before enabling SSL.

```bash
cd /opt/driving-school-crm/repo
./deploy/deploy.sh
```

This will:

1. Build/pull images
2. Start PostgreSQL, backend, and frontend
3. Run Alembic migrations
4. Seed default data

Visit `http://your-domain.com` or `http://YOUR_DROPLET_IP` and log in with the seeded super admin:

- Phone: `0782832711`
- PIN: `1234`

**Change the default PIN immediately.**

---

## 5. Enable SSL (HTTPS)

Once HTTP works, obtain certificates:

```bash
docker compose -f docker-compose.prod.yml stop frontend certbot

certbot certonly --standalone -d your-domain.com -d www.your-domain.com
```

Edit `frontend/nginx.prod.conf`:

1. Uncomment the `return 301 https://$host$request_uri;` block in the HTTP server.
2. Uncomment the entire HTTPS server block and replace `YOUR_DOMAIN.COM` with your domain.

Restart:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate frontend certbot
```

Certbot will auto-renew certificates. The `crm-certbot` container runs a renewal loop.

---

## 6. CI/CD with GitHub Actions

A workflow is provided in `.github/workflows/deploy.yml`. It builds Docker images, pushes them to GitHub Container Registry, and deploys to the droplet via SSH.

### Required GitHub secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value | Required |
|--------|-------|----------|
| `DROPLET_HOST` | Your droplet's public IP or domain | Yes |
| `DROPLET_USER` | Deployment user (e.g. `crm` or `root`) | Yes |
| `DROPLET_SSH_KEY` | Private SSH key with access to the droplet | Yes |
| `BACKEND_ENV_PROD` | Full contents of `backend/.env.prod` | No* |

\* If `BACKEND_ENV_PROD` is provided, the workflow will overwrite `backend/.env.prod` on the droplet on every deploy. If omitted, the file must already exist on the droplet (created during initial setup).

### On the droplet

Ensure the deployment user can pull from GitHub and run Docker. Add the public SSH key to `~/.ssh/authorized_keys`.

Pushes to `main` will now trigger a build and automatic deployment.

---

## 7. Backups

### PostgreSQL

Add a cron job on the droplet for nightly database dumps:

```bash
sudo crontab -e
```

```cron
0 3 * * * docker exec crm-postgres pg_dump -U crm_user crm_db > /opt/backups/crm-$(date +\%Y\%m\%d).sql 2>&1
0 4 * * * find /opt/backups -name 'crm-*.sql' -mtime +7 -delete
```

Create the backup directory first:

```bash
mkdir -p /opt/backups
```

### Uploaded files

The `uploads_data` Docker volume stores uploaded videos and files. Back it up regularly:

```bash
docker run --rm -v crm_uploads_data:/data -v /opt/backups:/backup alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

---

## 8. Useful commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart services
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart frontend

# Run migrations manually
docker compose -f docker-compose.prod.yml exec backend bash -c 'PYTHONPATH=/app alembic upgrade head'

# Open a shell in the backend container
docker compose -f docker-compose.prod.yml exec backend bash

# Check container status
docker compose -f docker-compose.prod.yml ps
```

---

## 9. Troubleshooting

### Cannot reach the site

- Check UFW: `ufw status`
- Check DigitalOcean cloud firewall rules
- Verify Nginx is running: `docker logs crm-frontend`
- Check backend health: `curl http://localhost:8000/health` from the droplet

### Migrations fail

- Ensure PostgreSQL is healthy: `docker logs crm-postgres`
- Verify env vars are set: `env | grep POSTGRES`
- Run migrations manually and read the error output

### SSL not working

- Ensure port 443 is open in UFW and DigitalOcean firewall
- Verify certificate paths in `frontend/nginx.prod.conf`
- Check certbot logs: `docker logs crm-certbot`

---

## 10. Local development vs production

| | Local dev | Production |
|--|-----------|------------|
| Compose file | `docker-compose.yml` | `docker-compose.prod.yml` |
| Backend env | `backend/.env` | `backend/.env.prod` |
| Postgres port | `5433` exposed | Internal only |
| Source mount | `backend/app:/app/app` (live reload) | None (image only) |
| SSL | None | Let's Encrypt |
