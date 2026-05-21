/**
 * PM2 process file for VPS deployment (crm.nepatronix.org → port 3001).
 *
 * On the server:
 *   cp .env.production.example .env.production   # fill secrets
 *   npm ci && npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
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
