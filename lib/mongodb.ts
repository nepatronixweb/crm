import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** URI used for the active connection — if env changes, we reconnect */
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
    if (process.env.NODE_ENV === "development") {
      const db = mongoDbNameFromUri(MONGODB_URI);
      if (db) console.info(`[mongodb] connecting to database: ${db}`);
    }
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
  }

  cached.conn = await cached.promise;
  cached.uri = MONGODB_URI;
  return cached.conn;
}

export default connectDB;
