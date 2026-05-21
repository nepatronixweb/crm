import { NextResponse } from "next/server";
import connectDB, { mongoDbNameFromUri } from "@/lib/mongodb";
import mongoose from "mongoose";

/**
 * Dev helper: confirms which MongoDB database the app is using.
 * GET http://localhost:3000/api/health/db
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const uri = process.env.MONGODB_URI ?? "";
  await connectDB();
  const db = mongoose.connection.db!;
  const cols = await db.listCollections().toArray();
  const names = cols.map((c) => c.name).sort();
  const counts: Record<string, number> = {};
  for (const name of names) {
    counts[name] = await db.collection(name).countDocuments();
  }

  return NextResponse.json({
    configuredDatabase: mongoDbNameFromUri(uri),
    connectedDatabase: db.databaseName,
    uriHost: uri.replace(/\/\/[^@]+@/, "//***@").replace(/\/[^/?]+(\?|$)/, "/<db>$1"),
    collections: counts,
    match: mongoDbNameFromUri(uri) === db.databaseName,
  });
}
