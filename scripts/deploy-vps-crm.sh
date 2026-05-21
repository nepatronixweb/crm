#!/usr/bin/env bash
# Deploy / refresh CRM on port 3001 (crm.nepatronix.org).
# Assumes repo is at /var/www/crm and .env.production is already configured.
#
# Usage on VPS:
#   cd /var/www/crm && bash scripts/deploy-vps-crm.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/crm}"
PM2_NAME="${PM2_NAME:-crm}"

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy from .env.production.example and fill secrets first."
  exit 1
fi

echo "==> git pull"
git pull origin main

echo "==> npm ci"
npm ci

echo "==> build"
npm run build

echo "==> pm2 restart $PM2_NAME"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save
echo "Done. CRM should be on http://127.0.0.1:3001 (nginx → crm.nepatronix.org)"
