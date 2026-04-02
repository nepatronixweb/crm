/**
 * Create .env.local from .env.example if it does not exist (safe to run anytime).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const example = path.join(root, ".env.example");
const local = path.join(root, ".env.local");

if (!fs.existsSync(example)) {
  console.error("Missing .env.example");
  process.exit(1);
}

if (fs.existsSync(local)) {
  console.log(".env.local already exists — not overwriting.");
} else {
  fs.copyFileSync(example, local);
  console.log("Created .env.local from .env.example");
  console.log("\nNext steps:");
  console.log("  1. Edit .env.local — set NEXTAUTH_SECRET (run: openssl rand -base64 32)");
  console.log("  2. Start MongoDB — MONGODB_URI should match your local database name");
  console.log("  3. npm run seed          (full demo data + admin@etg.com / Admin@123)");
  console.log("     or npm run reset-admin (only reset/create admin; needs a branch or run seed once)");
  console.log("  4. npm run dev — open http://localhost:3000\n");
}
