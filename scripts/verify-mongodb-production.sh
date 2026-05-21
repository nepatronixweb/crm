#!/usr/bin/env bash
# Test CRM MongoDB credentials from .env.production
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production"
  exit 1
fi

COUNT=$(grep -c '^MONGODB_URI=' .env.production 2>/dev/null || echo 0)
if [[ "$COUNT" -ne 1 ]]; then
  echo "ERROR: expected exactly 1 MONGODB_URI line, found $COUNT"
  grep '^MONGODB_URI=' .env.production || true
  exit 1
fi

MONGODB_URI=$(grep '^MONGODB_URI=' .env.production | cut -d= -f2- | tr -d '\r' | xargs)

if [[ -z "$MONGODB_URI" ]]; then
  echo "MONGODB_URI is empty"
  exit 1
fi

if [[ ! "$MONGODB_URI" =~ ^mongodb(\+srv)?:// ]]; then
  echo "ERROR: MONGODB_URI must start with mongodb:// or mongodb+srv://"
  echo "Got: $MONGODB_URI"
  echo "Fix: run sudo bash scripts/fix-vps-mongo-env.sh"
  exit 1
fi

echo "Testing (password hidden):"
echo "$MONGODB_URI" | sed -E 's/:([^:@/]+)@/:***@/'

mongosh "$MONGODB_URI" --eval 'db.runCommand({ ping: 1 })' || {
  echo ""
  echo "FAILED — run: sudo bash scripts/fix-vps-mongo-env.sh"
  exit 1
}

echo "OK — MongoDB authentication works."
