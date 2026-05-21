#!/usr/bin/env bash
# Create a dedicated MongoDB database + user for CRM (port 3001 app).
# ETG on port 3000 should use a DIFFERENT database (e.g. "etg") on the same MongoDB server.
#
# Run on the VPS as root or a user with mongosh admin access:
#   chmod +x scripts/setup-vps-mongodb-crm.sh
#   sudo CRM_DB_USER=crmuser CRM_DB_PASS='YourStrongPass123!' ./scripts/setup-vps-mongodb-crm.sh
#
# Then in /var/www/crm/.env.production:
#   MONGODB_URI=mongodb://crmuser:YourStrongPass123!@127.0.0.1:27017/crm?authSource=admin

set -euo pipefail

CRM_DB_NAME="${CRM_DB_NAME:-crm}"
CRM_DB_USER="${CRM_DB_USER:-crmuser}"
CRM_DB_PASS="${CRM_DB_PASS:-}"

if [[ -z "$CRM_DB_PASS" ]]; then
  echo "Set CRM_DB_PASS before running, e.g.:"
  echo "  CRM_DB_PASS='YourStrongPass123!' $0"
  exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not found. Install MongoDB shell on the server first."
  exit 1
fi

# Escape single quotes in password for JS string
CRM_DB_PASS_ESC="${CRM_DB_PASS//\'/\\\'}"

mongosh --quiet <<EOF
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
db.createCollection("_init")
print("Database $CRM_DB_NAME is ready")
EOF

echo ""
echo "Add to /var/www/crm/.env.production:"
echo "MONGODB_URI=mongodb://${CRM_DB_USER}:<url-encoded-password>@127.0.0.1:27017/${CRM_DB_NAME}?authSource=admin"
echo ""
echo "Then:"
echo "  cd /var/www/crm"
echo "  npx tsx --env-file=.env.production scripts/reset-admin-password.ts"
echo "  npm run build && pm2 restart crm --update-env"
