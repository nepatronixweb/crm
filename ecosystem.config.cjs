/**
 * PM2 — CRM only (port 3001, crm.nepatronix.org).
 *
 * Loads .env.production via dotenv so MONGODB_URI is always passed to Next.js.
 */
const path = require("path");
const dotenv = require("dotenv");

const prodPath = path.join(__dirname, ".env.production");
const loaded = dotenv.config({ path: prodPath });
if (loaded.error) {
  console.warn("[ecosystem] Warning: could not load .env.production:", loaded.error.message);
}

const productionEnv = loaded.parsed || {};

if (!productionEnv.MONGODB_URI) {
  console.error("[ecosystem] FATAL: MONGODB_URI missing in .env.production");
  process.exit(1);
}

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
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXTAUTH_URL: "https://crm.nepatronix.org",
        ...productionEnv,
      },
    },
  ],
};
