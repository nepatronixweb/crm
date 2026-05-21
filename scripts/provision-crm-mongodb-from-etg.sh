#!/usr/bin/env bash
# Use the SAME MongoDB credentials as ETG, but database "crm".
# Grants the ETG user readWrite on "crm", then writes MONGODB_URI to CRM .env.production.
#
# Run on VPS:
#   cd /var/www/crm
#   git pull
#   sudo bash scripts/provision-crm-mongodb-from-etg.sh
#
# Requires /var/www/etg/.env.production with a working MONGODB_URI.

set -euo pipefail

ETG_ENV="${ETG_ENV:-/var/www/etg/.env.production}"
CRM_ENV="${CRM_ENV:-/var/www/crm/.env.production}"
CRM_DB_NAME="${CRM_DB_NAME:-crm}"

if [[ ! -f "$ETG_ENV" ]]; then
  echo "Missing ETG env: $ETG_ENV"
  exit 1
fi

ETG_URI="$(grep '^MONGODB_URI=' "$ETG_ENV" | tail -1 | cut -d= -f2- | tr -d '\r' | xargs)"
if [[ -z "$ETG_URI" ]]; then
  echo "No MONGODB_URI in $ETG_ENV"
  exit 1
fi

# Replace database segment (etg, etg-crm, etc.) with crm
CRM_URI="$(node -e "
const uri = process.argv[1];
const q = uri.indexOf('?');
const base = q === -1 ? uri : uri.slice(0, q);
const query = q === -1 ? '' : uri.slice(q);
const slash = base.lastIndexOf('/');
if (slash < 0) { console.log(uri); process.exit(0); }
console.log(base.slice(0, slash + 1) + process.argv[2] + query);
" "$ETG_URI" "$CRM_DB_NAME")"

echo "ETG URI (masked): $(echo "$ETG_URI" | sed -E 's/:([^:@/]+)@/:***@/')"
echo "CRM URI (masked): $(echo "$CRM_URI" | sed -E 's/:([^:@/]+)@/:***@/')"

# Extract username for grant
MONGO_USER="$(node -e "
const uri = process.argv[1];
const rest = uri.replace(/^mongodb(?:\\+srv)?:\\/\\//, '');
const at = rest.indexOf('@');
if (at < 0) process.exit(1);
const user = rest.slice(0, at).split(':')[0];
console.log(decodeURIComponent(user));
" "$ETG_URI" 2>/dev/null || true)"

if [[ -n "$MONGO_USER" ]] && command -v mongosh >/dev/null 2>&1; then
  echo "Granting readWrite on $CRM_DB_NAME to user: $MONGO_USER"
  mongosh "$ETG_URI" --quiet --eval "
    const dbName = '$CRM_DB_NAME';
    const user = '$MONGO_USER';
    try {
      db.getSiblingDB(dbName).grantRolesToUser(user, [{ role: 'readWrite', db: dbName }]);
      print('Granted readWrite on ' + dbName + ' to ' + user);
    } catch (e) {
      print('Grant note: ' + e);
    }
  " || echo "(Grant skipped — run manually if CRM auth still fails)"
fi

echo "Testing CRM connection..."
if ! mongosh "$CRM_URI" --quiet --eval 'const r = db.runCommand({ ping: 1 }); if (!r.ok) quit(1)'; then
  echo ""
  echo "FAILED: CRM URI does not authenticate."
  echo "Fix: create crmuser with scripts/setup-vps-mongodb-crm.sh using MONGODB_ADMIN_URI,"
  echo "or ask your host for MongoDB admin credentials."
  exit 1
fi
echo "MongoDB ping OK for database $CRM_DB_NAME"

if [[ -f "$CRM_ENV" ]]; then
  cp "$CRM_ENV" "${CRM_ENV}.bak.$(date +%s)"
  grep -v '^MONGODB_URI=' "$CRM_ENV" | grep -v '^#.*MONGODB_URI=' > "${CRM_ENV}.tmp" || true
  {
    cat "${CRM_ENV}.tmp" 2>/dev/null || true
    echo "MONGODB_URI=$CRM_URI"
  } > "${CRM_ENV}.new"
  rm -f "${CRM_ENV}.tmp"
  mv "${CRM_ENV}.new" "$CRM_ENV"
  echo "Updated $CRM_ENV (backup saved)"
else
  echo "MONGODB_URI=$CRM_URI" > "$CRM_ENV"
  echo "Created $CRM_ENV"
fi

echo ""
echo "Next:"
echo "  cd /var/www/crm"
echo "  pm2 delete crm 2>/dev/null || true"
echo "  pm2 start ecosystem.config.cjs"
echo "  pm2 save"
echo "  pm2 logs crm --lines 20"
