#!/usr/bin/env bash
# Fix CRM (and verify ETG) MONGODB_URI from working ETG credentials.
# Run on VPS: sudo bash /var/www/crm/scripts/fix-vps-mongo-env.sh

set -euo pipefail

ETG_ENV="${ETG_ENV:-/var/www/etg/.env.production}"
CRM_ENV="${CRM_ENV:-/var/www/crm/.env.production}"

echo "==> Reading ETG MONGODB_URI"
if [[ ! -f "$ETG_ENV" ]]; then
  echo "Missing $ETG_ENV"
  exit 1
fi

ETG_COUNT=$(grep -c '^MONGODB_URI=' "$ETG_ENV" 2>/dev/null || echo 0)
if [[ "$ETG_COUNT" -ne 1 ]]; then
  echo "WARNING: ETG has $ETG_COUNT MONGODB_URI lines in $ETG_ENV (should be 1)"
fi

ETG_URI=$(grep '^MONGODB_URI=' "$ETG_ENV" | tail -1 | cut -d= -f2- | tr -d '\r' | xargs)

if [[ -z "$ETG_URI" ]]; then
  echo "ETG MONGODB_URI is empty"
  exit 1
fi

if [[ ! "$ETG_URI" =~ ^mongodb(\+srv)?:// ]]; then
  echo "ETG MONGODB_URI is invalid (must start with mongodb:// or mongodb+srv://):"
  echo "$ETG_URI"
  exit 1
fi

echo "ETG URI (masked): $(echo "$ETG_URI" | sed -E 's/:([^:@/]+)@/:***@/')"

echo "==> Testing ETG database connection"
if ! mongosh "$ETG_URI" --quiet --eval 'const r=db.runCommand({ping:1}); if(!r.ok) quit(1)'; then
  echo "FAILED: ETG MongoDB URI does not work. Fix $ETG_ENV first (restore from backup)."
  exit 1
fi
echo "ETG MongoDB: OK"

CRM_URI=$(node -e "
const uri = process.argv[1];
const q = uri.indexOf('?');
const base = q === -1 ? uri : uri.slice(0, q);
const query = q === -1 ? '' : uri.slice(q);
const slash = base.lastIndexOf('/');
console.log(base.slice(0, slash + 1) + 'crm' + query);
" "$ETG_URI")

echo "==> Grant ETG user readWrite on database crm (if needed)"
MONGO_USER=$(node -e "
const r = process.argv[1].replace(/^mongodb(?:\\+srv)?:\\/\\//,'');
const at = r.indexOf('@');
if (at < 0) process.exit(1);
console.log(decodeURIComponent(r.slice(0,at).split(':')[0]));
" "$ETG_URI" 2>/dev/null || true)

if [[ -n "$MONGO_USER" ]]; then
  mongosh "$ETG_URI" --quiet --eval "
    try {
      db.getSiblingDB('crm').grantRolesToUser('$MONGO_USER', [{ role: 'readWrite', db: 'crm' }]);
      print('Granted readWrite on crm to $MONGO_USER');
    } catch (e) { print(String(e)); }
  " || true
fi

echo "==> Testing CRM database connection"
if ! mongosh "$CRM_URI" --quiet --eval 'const r=db.runCommand({ping:1}); if(!r.ok) quit(1)'; then
  echo "FAILED: CRM URI auth failed:"
  echo "$(echo "$CRM_URI" | sed -E 's/:([^:@/]+)@/:***@/')"
  exit 1
fi
echo "CRM MongoDB: OK"

if [[ -f "$CRM_ENV" ]]; then
  cp "$CRM_ENV" "${CRM_ENV}.bak.$(date +%s)"
fi

if [[ -f "$CRM_ENV" ]]; then
  grep -v '^MONGODB_URI=' "$CRM_ENV" > "${CRM_ENV}.body" || true
else
  : > "${CRM_ENV}.body"
fi

{
  echo "# Auto-fixed by scripts/fix-vps-mongo-env.sh"
  echo "MONGODB_URI=$CRM_URI"
  cat "${CRM_ENV}.body"
} > "${CRM_ENV}.new"
rm -f "${CRM_ENV}.body"
mv "${CRM_ENV}.new" "$CRM_ENV"

echo "==> Wrote $CRM_ENV (one MONGODB_URI line)"
grep '^MONGODB_URI=' "$CRM_ENV" | sed -E 's/:([^:@/]+)@/:***@/'

echo ""
echo "Restart apps:"
echo "  pm2 restart etg --update-env"
echo "  cd /var/www/crm && pm2 restart crm --update-env"
