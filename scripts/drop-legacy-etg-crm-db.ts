/**
 * Drops the legacy local database "etg-crm" (old name). Does NOT touch "crm".
 * Usage: npx tsx scripts/drop-legacy-etg-crm-db.ts
 */
import mongoose from "mongoose";

const LEGACY_URI = "mongodb://127.0.0.1:27017/etg-crm";

async function main() {
  await mongoose.connect(LEGACY_URI);
  const db = mongoose.connection.db!;
  const cols = await db.listCollections().toArray();
  console.log(`Legacy database "${db.databaseName}" has ${cols.length} collection(s).`);
  if (cols.length === 0) {
    console.log("Nothing to drop.");
    await mongoose.disconnect();
    return;
  }
  await db.dropDatabase();
  console.log(`Dropped database "${db.databaseName}".`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
