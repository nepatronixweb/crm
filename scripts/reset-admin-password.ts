/**
 * Set admin@etg.com password to Admin@123 (or ADMIN_RESET_PASSWORD).
 * Creates the user if missing. If there are no branches, creates "Kathmandu - Main" first
 * so a fresh local MongoDB can sign in after this script alone.
 *
 * Local:  npx tsx --env-file=.env.local scripts/reset-admin-password.ts
 * Server: npx tsx --env-file=.env.production scripts/reset-admin-password.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import Branch from "@/models/Branch";

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = "admin@etg.com";
const plainPassword = process.env.ADMIN_RESET_PASSWORD ?? "Admin@123";

async function main() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const hash = await bcrypt.hash(plainPassword, 10);
  let user = await User.findOne({ email: ADMIN_EMAIL });

  if (!user) {
    let branch = await Branch.findOne().sort({ createdAt: 1 });
    if (!branch) {
      branch = await Branch.create({
        name: "Kathmandu - Main",
        location: "Kathmandu, Nepal",
        phone: "+977-1-4444444",
        email: "ktm@etg.com",
        isActive: true,
      });
      console.log(`✅ Created default branch: ${branch.name}`);
    }
    await User.create({
      name: "Super Admin",
      email: ADMIN_EMAIL,
      password: hash,
      role: "super_admin",
      branch: branch._id,
      isActive: true,
      permissions: [],
    });
    console.log(`✅ Created ${ADMIN_EMAIL}`);
  } else {
    user.password = hash;
    user.isActive = true;
    await user.save();
    console.log(`✅ Password reset for ${ADMIN_EMAIL}`);
  }

  console.log(`\nYou can sign in with:\n  Email:    ${ADMIN_EMAIL}\n  Password: ${plainPassword}\n`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
