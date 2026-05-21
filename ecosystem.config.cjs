/**
 * PM2 — CRM only (port 3001, crm.nepatronix.org).
 *
 * On the VPS this repo should live in its own folder, e.g. /var/www/crm
 * ETG (port 3000) runs from a separate folder (/var/www/etg) with its own PM2 app.
 *
 * First deploy:
 *   cp .env.production.example .env.production
 *   bash scripts/setup-vps-mongodb-crm.sh   # creates database "crm"
 *   npx tsx --env-file=.env.production scripts/reset-admin-password.ts
 *   npm ci && npm run build
 *   pm2 start ecosystem.config.cjs && pm2 save
 *
 * Updates:
 *   bash scripts/deploy-vps-crm.sh
 */
module.exports = {
  apps: [
    {
      name: "crm",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      instances: 1,
      autorestart: true,
      max_memory_restart: "800M",
      env_file: ".env.production",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXTAUTH_URL: "https://crm.nepatronix.org",
      },
    },
  ],
};
