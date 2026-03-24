import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

async function connectDB(): Promise<typeof mongoose> {
  validateEnv();
  const MONGODB_URI = process.env.MONGODB_URI as string;

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
