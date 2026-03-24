import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) return NextResponse.json({ error: "DB not connected" }, { status: 500 });

    let objectId: mongoose.Types.ObjectId;
    try {
      objectId = new mongoose.Types.ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "documents" });

    // Find file metadata
    const files = await bucket.find({ _id: objectId }).toArray();
    if (files.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const file = files[0];

    const chunks: Buffer[] = [];
    const downloadStream = bucket.openDownloadStream(objectId);

    await new Promise<void>((resolve, reject) => {
      downloadStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      downloadStream.on("end", resolve);
      downloadStream.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileDoc = file as any;
    const contentType = fileDoc.contentType || file.metadata?.contentType || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("GET /api/documents/file/[id] error:", err);
    return NextResponse.json({ error: "Failed to retrieve file" }, { status: 500 });
  }
}
