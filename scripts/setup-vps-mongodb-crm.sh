#!/usr/bin/env bash
# Create MongoDB database "crm" + user "crmuser" (separate from ETG database "etg").
#
# Requires an admin connection (MongoDB auth is enabled on your VPS):
#
#   export MONGODB_ADMIN_URI="$(grep '^MONGODB_URI=' /var/www/etg/.env.production | tail -1 | cut -d= -f2- | tr -d '\r')"
#   sudo CRM_DB_PASS='YourStrongPassword123!' MONGODB_ADMIN_URI="$MONGODB_ADMIN_URI" \
#     bash scripts/setup-vps-mongodb-crm.sh
#
# Then ONE line in /var/www/crm/.env.production (encode ! as %21):
#   MONGODB_URI=mongodb://crmuser:YourStrongPassword123%21@127.0.0.1:27017/crm?authSource=crm

set -euo pipefail

CRM_DB_NAME="${CRM_DB_NAME:-crm}"
CRM_DB_USER="${CRM_DB_USER:-crmuser}"
CRM_DB_PASS="${CRM_DB_PASS:-}"
MONGODB_ADMIN_URI="${MONGODB_ADMIN_URI:-}"

if [[ -z "$CRM_DB_PASS" ]]; then
  echo "Set CRM_DB_PASS before running."
  exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh not found."
  exit 1
fi

if [[ -z "$MONGODB_ADMIN_URI" ]] && [[ -f /var/www/etg/.env.production ]]; then
  MONGODB_ADMIN_URI="$(grep '^MONGODB_URI=' /var/www/etg/.env.production | tail -1 | cut -d= -f2- | tr -d '\r' | xargs)"
  echo "Using MONGODB_ADMIN_URI from /var/www/etg/.env.production"
fi

if [[ -z "$MONGODB_ADMIN_URI" ]]; then
  echo "Set MONGODB_ADMIN_URI to your MongoDB admin connection string."
  exit 1
fi

CRM_DB_PASS_ESC="${CRM_DB_PASS//\'/\\\'}"

mongosh "$MONGODB_ADMIN_URI" --quiet <<EOF
const dbName = "$CRM_DB_NAME";
const dbh = db.getSiblingDB(dbName);
try {
  dbh.createUser({
    user: "$CRM_DB_USER",
    pwd: "$CRM_DB_PASS_ESC",
    roles: [{ role: "readWrite", db: dbName }]
  });
  print("Created user $CRM_DB_USER on database " + dbName);
} catch (e) {
  const msg = String(e);
  if (msg.includes("already exists")) {
    print("User $CRM_DB_USER exists — updating password");
    dbh.updateUser("$CRM_DB_USER", {
      pwd: "$CRM_DB_PASS_ESC",
      roles: [{ role: "readWrite", db: dbName }]
    });
  } else {
    throw e;
  }
}
try {
  dbh.createCollection("_init");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
print("Database " + dbName + " is ready");
EOF

echo ""
echo "Put exactly ONE line in /var/www/crm/.env.production:"
echo "MONGODB_URI=mongodb://${CRM_DB_USER}:<url-encoded-password>@127.0.0.1:27017/${CRM_DB_NAME}?authSource=${CRM_DB_NAME}"
echo ""
echo "Test: mongosh \"mongodb://${CRM_DB_USER}:PASSWORD@127.0.0.1:27017/${CRM_DB_NAME}?authSource=${CRM_DB_NAME}\" --eval 'db.runCommand({ping:1})'"
echo ""
echo "Then: pm2 delete crm; pm2 start ecosystem.config.cjs; pm2 save"
