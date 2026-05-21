import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** URI used for the active connection - if env changes, we reconnect */
  uri: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? {
  conn: null,
  promise: null,
  uri: null,
};

if (!global.mongoose) {
  global.mongoose = cached;
}

/** True if URI includes username:password@ (not empty user). */
export function mongoUriHasCredentials(uri: string): boolean {
  return /^mongodb(?:\+srv)?:\/\/[^/]+@/i.test(uri);
}

export function maskMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, "//***@");
}

/** Database name segment from MONGODB_URI (for logs / sanity checks). */
export function mongoDbNameFromUri(uri: string): string {
  const q = uri.indexOf("?");
  const base = q === -1 ? uri : uri.slice(0, q);
  const slash = base.lastIndexOf("/");
  if (slash < 0 || slash >= base.length - 1) return "";
  return base.slice(slash + 1);
}

async function connectDB(): Promise<typeof mongoose> {
  validateEnv();
  const MONGODB_URI = process.env.MONGODB_URI as string;

  if (cached.uri !== null && cached.uri !== MONGODB_URI) {
    await mongoose.disconnect().catch(() => {});
    cached.conn = null;
    cached.promise = null;
    cached.uri = null;
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const db = mongoDbNameFromUri(MONGODB_URI);
    const hasAuth = mongoUriHasCredentials(MONGODB_URI);
    if (db) {
      console.info(
        `[mongodb] connecting to database: ${db} (credentials in URI: ${hasAuth ? "yes" : "NO — auth will fail"})`
      );
      if (!hasAuth) {
        console.error(
          `[mongodb] MONGODB_URI has no username/password (${maskMongoUri(MONGODB_URI)}). ` +
            `On VPS use the same user as ETG or run: sudo bash scripts/provision-crm-mongodb-from-etg.sh`
        );
      }
      if (db === "etg-crm") {
        console.warn(
          "[mongodb] WARNING: MONGODB_URI points to legacy database etg-crm. Use /crm instead (see .env.local)."
        );
      }
    }
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      })
      .then(async (m) => {
        await m.connection.db?.admin().command({ ping: 1 });
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    console.error("[mongodb] connection failed:", err);
    throw err;
  }
  cached.uri = MONGODB_URI;
  return cached.conn;
}

export default connectDB;
