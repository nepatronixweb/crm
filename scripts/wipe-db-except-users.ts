/**
 * Drops every collection in MONGODB_URI database except `users`.
 * Usage: npx tsx --env-file=.env.local scripts/wipe-db-except-users.ts
 */
import mongoose from "mongoose";
import { mongoDbNameFromUri } from "@/lib/mongodb";

const KEEP = "users";

async function main() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const dbName = mongoDbNameFromUri(uri) || db.databaseName;
  console.log(`Database: ${dbName}\n`);

  const cols = await db.listCollections().toArray();
  const names = cols.map((c) => c.name).filter((n) => !n.startsWith("system."));

  const toDrop = names.filter((n) => n !== KEEP);
  if (toDrop.length === 0) {
    console.log("No collections to drop (only users or empty).");
    await mongoose.disconnect();
    return;
  }

  const userCount = await db.collection(KEEP).countDocuments();
  console.log(`Keeping "${KEEP}" (${userCount} documents)`);
  console.log(`Dropping ${toDrop.length} collection(s):\n`);

  for (const name of toDrop.sort()) {
    const before = await db.collection(name).estimatedDocumentCount();
    await db.collection(name).drop();
    console.log(`  dropped ${name} (~${before} docs)`);
  }

  const remaining = await db.listCollections().toArray();
  console.log(
    `\nDone. Remaining collections: ${remaining.map((c) => c.name).join(", ") || "(none)"}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
