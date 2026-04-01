/**
 * PM2 process file for VPS deployment.
 * On the server: place real secrets in .env.production (not committed).
 * Start: NODE_ENV=production pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "etg",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
