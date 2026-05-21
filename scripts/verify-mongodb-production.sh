#!/usr/bin/env bash
# Test CRM MongoDB credentials from .env.production
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production"
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -v '^#' .env.production | grep '^MONGODB_URI=' | tail -1 | xargs)

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "No MONGODB_URI in .env.production"
  exit 1
fi

echo "Testing (password hidden):"
echo "$MONGODB_URI" | sed -E 's/:([^:@/]+)@/:***@/'

mongosh "$MONGODB_URI" --eval 'db.runCommand({ ping: 1 })' || {
  echo ""
  echo "FAILED — fix password, authSource=crm, and remove duplicate MONGODB_URI lines."
  exit 1
}

echo "OK — MongoDB authentication works."
