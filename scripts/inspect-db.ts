/**
 * Quick DB sanity check. Usage: npx tsx --env-file=.env.local scripts/inspect-db.ts
 */
import mongoose from "mongoose";

async function inspect(uri: string, label: string) {
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const cols = await db.listCollections().toArray();
  const users = await db.collection("users").countDocuments();
  const branches = await db.collection("branches").countDocuments();
  const sample = await db
    .collection("users")
    .find({}, { projection: { email: 1, role: 1, name: 1 } })
    .limit(5)
    .toArray();
  console.log(`\n[${label}] ${uri}`);
  console.log(`  database: ${db.databaseName}`);
  console.log(`  collections: ${cols.map((c) => c.name).join(", ") || "(none)"}`);
  console.log(`  users: ${users}, branches: ${branches}`);
  if (sample.length) console.log(`  sample users:`, sample);
  await mongoose.disconnect();
}

async function main() {
  const crm = process.env.MONGODB_URI!;
  await inspect(crm, "MONGODB_URI");
  if (!crm.includes("/etg-crm")) {
    await inspect("mongodb://127.0.0.1:27017/etg-crm", "legacy etg-crm");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
