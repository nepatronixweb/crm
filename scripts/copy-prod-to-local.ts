/**
 * Copies all user collections from SOURCE (default: MONGODB_URI) to DESTINATION (default: local etg-crm).
 * Usage: npx tsx --env-file=.env.local scripts/copy-prod-to-local.ts
 *
 * Skips _pendingUploads and _uploadChunks (stale chunked-upload temp data; not needed for GridFS files).
 * Set COPY_TEMP_COLLECTIONS=1 to include them.
 *
 * Optional: MONGODB_URI_SOURCE overrides source; MONGODB_URI_LOCAL overrides destination.
 */
import { MongoClient } from "mongodb";

/** Large GridFS chunk docs: small batches avoid huge insertMany payloads over the wire. */
function batchLimit(collectionName: string): number {
  if (collectionName.includes(".chunks")) return 20;
  return 800;
}

function maskUri(uri: string): string {
  try {
    return uri.replace(/\/\/[^@]+@/, "//***@");
  } catch {
    return "(hidden)";
  }
}

async function main() {
  const sourceUri =
    process.env.MONGODB_URI_SOURCE?.trim() || process.env.MONGODB_URI?.trim();
  const destUri =
    process.env.MONGODB_URI_LOCAL?.trim() ||
    "mongodb://127.0.0.1:27017/etg-crm";

  if (!sourceUri) {
    console.error("Set MONGODB_URI (e.g. in .env.local) or MONGODB_URI_SOURCE.");
    process.exit(1);
  }

  if (sourceUri === destUri) {
    console.error("Source and destination URIs are the same; aborting.");
    process.exit(1);
  }

  console.log("Source:", maskUri(sourceUri));
  console.log("Destination:", maskUri(destUri));

  const sourceClient = new MongoClient(sourceUri);
  const destClient = new MongoClient(destUri);

  await sourceClient.connect();
  await destClient.connect();

  const sourceDb = sourceClient.db();
  const destDb = destClient.db();

  const includeTemp = process.env.COPY_TEMP_COLLECTIONS === "1";
  const skipTemp = (n: string) =>
    !includeTemp && (n === "_pendingUploads" || n === "_uploadChunks");

  const cols = await sourceDb.listCollections().toArray();
  const names = cols
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .filter((n) => !skipTemp(n));

  const gridfsOrder = (n: string) => {
    if (n === "documents.files") return 0;
    if (n === "documents.chunks") return 1;
    return 2;
  };
  names.sort((a, b) => {
    const ga = gridfsOrder(a);
    const gb = gridfsOrder(b);
    if (ga !== gb) return ga - gb;
    return a.localeCompare(b);
  });

  console.log(`Collections to copy: ${names.length}`);

  for (const name of names) {
    const src = sourceDb.collection(name);
    const count = await src.estimatedDocumentCount();
    process.stdout.write(`  ${name} (~${count}) ... `);

    const dest = destDb.collection(name);
    const wiped = await dest.deleteMany({});
    if (wiped.deletedCount > 0) {
      process.stdout.write(`(replaced ${wiped.deletedCount}) `);
    }

    const limit = batchLimit(name);
    let copied = 0;
    const cursor = src.find({}).batchSize(Math.min(limit, 100));
    let batch: object[] = [];

    const dedupe = (docs: object[]) => {
      const byId = new Map<string, object>();
      for (const d of docs) {
        const id = String((d as { _id: { toString(): string } })._id);
        byId.set(id, d);
      }
      return [...byId.values()];
    };

    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length >= limit) {
        const unique = dedupe(batch);
        if (unique.length < batch.length) {
          console.warn(`\n    warning: ${name} batch had duplicate _id, inserted ${unique.length}`);
        }
        await dest.insertMany(unique, { ordered: true });
        copied += unique.length;
        batch = [];
      }
    }
    if (batch.length) {
      const unique = dedupe(batch);
      await dest.insertMany(unique, { ordered: true });
      copied += unique.length;
    }

    try {
      const indexes = await src.listIndexes().toArray();
      for (const spec of indexes) {
        if (spec.name === "_id_") continue;
        const { key, name: idxName, ...rest } = spec;
        const opts = { name: idxName, ...rest } as Record<string, unknown>;
        delete opts.v;
        delete opts.key;
        await dest.createIndex(key as Record<string, 1 | -1>, opts);
      }
    } catch {
      // indexes optional for local dev
    }

    console.log(`${copied} docs`);
  }

  await sourceClient.close();
  await destClient.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
