#!/usr/bin/env bash
# Create a dedicated MongoDB database + user for CRM (port 3001 app).
# ETG on port 3000 should use a DIFFERENT database (e.g. "etg") on the same MongoDB server.
#
# MongoDB on the VPS usually has auth enabled — pass an admin URI:
#
#   export MONGODB_ADMIN_URI="$(grep '^MONGODB_URI=' /var/www/etg/.env.production | tail -1 | cut -d= -f2-)"
#   # Admin user must be allowed to run createUser (userAdmin on admin, or root).
#
#   sudo CRM_DB_USER=crmuser CRM_DB_PASS='YourStrongPass123!' \
#     MONGODB_ADMIN_URI="$MONGODB_ADMIN_URI" \
#     bash scripts/setup-vps-mongodb-crm.sh
#
# Then in /var/www/crm/.env.production (ONE line only, URL-encode ! as %21):
#   MONGODB_URI=mongodb://crmuser:YourStrongPassword123%21@127.0.0.1:27017/crm?authSource=admin

set -euo pipefail

CRM_DB_NAME="${CRM_DB_NAME:-crm}"
CRM_DB_USER="${CRM_DB_USER:-crmuser}"
CRM_DB_PASS="${CRM_DB_PASS:-}"
MONGODB_ADMIN_URI="${MONGODB_ADMIN_URI:-}"

if [[ -z "$CRM_DB_PASS" ]]; then
  echo "Set CRM_DB_PASS before running, e.g.:"
  echo "  CRM_DB_PASS='YourStrongPass123!' MONGODB_ADMIN_URI='mongodb://admin:pass@127.0.0.1:27017/admin' $0"
  exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not found. Install MongoDB shell on the server first."
  exit 1
fi

if [[ -z "$MONGODB_ADMIN_URI" ]]; then
  if [[ -f /var/www/etg/.env.production ]]; then
    MONGODB_ADMIN_URI="$(grep '^MONGODB_URI=' /var/www/etg/.env.production | tail -1 | cut -d= -f2- | tr -d '\r' | xargs)"
    if [[ -n "$MONGODB_ADMIN_URI" ]]; then
      echo "Using MONGODB_ADMIN_URI from /var/www/etg/.env.production"
    fi
  fi
fi

if [[ -z "$MONGODB_ADMIN_URI" ]]; then
  echo "MongoDB requires authentication. Set MONGODB_ADMIN_URI to an admin connection string, e.g.:"
  echo "  export MONGODB_ADMIN_URI='mongodb://YOUR_ADMIN_USER:YOUR_ADMIN_PASS@127.0.0.1:27017/admin?authSource=admin'"
  echo "Then re-run this script."
  exit 1
fi

# Escape single quotes in password for JS string
CRM_DB_PASS_ESC="${CRM_DB_PASS//\'/\\\'}"

mongosh "$MONGODB_ADMIN_URI" --quiet <<EOF
use admin
try {
  db.createUser({
    user: "$CRM_DB_USER",
    pwd: "$CRM_DB_PASS_ESC",
    roles: [{ role: "readWrite", db: "$CRM_DB_NAME" }]
  })
  print("Created user $CRM_DB_USER with readWrite on $CRM_DB_NAME")
} catch (e) {
  if (String(e).includes("already exists")) {
    print("User $CRM_DB_USER already exists — updating password and roles")
    db.updateUser("$CRM_DB_USER", {
      pwd: "$CRM_DB_PASS_ESC",
      roles: [{ role: "readWrite", db: "$CRM_DB_NAME" }]
    })
  } else {
    throw e
  }
}
use $CRM_DB_NAME
try {
  db.createCollection("_init")
} catch (e) {
  if (!String(e).includes("already exists")) throw e
}
print("Database $CRM_DB_NAME is ready")
EOF

echo ""
echo "Add ONE line to /var/www/crm/.env.production (remove duplicate MONGODB_URI lines):"
echo "MONGODB_URI=mongodb://${CRM_DB_USER}:<url-encoded-password>@127.0.0.1:27017/${CRM_DB_NAME}?authSource=admin"
echo ""
echo "Then:"
echo "  cd /var/www/crm"
echo "  npx tsx --env-file=.env.production scripts/reset-admin-password.ts"
echo "  pm2 restart crm --update-env"
