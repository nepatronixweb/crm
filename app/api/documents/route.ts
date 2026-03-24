import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import StudentDocument from "@/models/Document";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();

    const { searchParams } = new URL(req.url);
    const student = searchParams.get("student");
    const lead = searchParams.get("lead");
    const country = searchParams.get("country");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (student) filter.student = student;
    if (lead) filter.lead = lead;
    if (country) filter.country = country;

    const [documents, total] = await Promise.all([
      StudentDocument.find(filter)
        .populate("uploadedBy", "name")
        .populate("student", "name phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StudentDocument.countDocuments(filter),
    ]);

    return NextResponse.json({ documents, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();

    const contentType = req.headers.get("content-type") || "";
    let studentId: string | null = null;
    let leadId: string | null = null;
    let country = "";
    let documentName = "";
    let filePath = "";
    let originalName = "";
    let fileSize = 0;
    let fileType = "";

    if (contentType.includes("application/json")) {
      // Client-side upload: file already stored in GridFS via /api/documents/upload
      const body = await req.json();
      studentId = body.studentId || null;
      leadId = body.leadId || null;
      country = body.country || "";
      documentName = body.name || "";
      filePath = body.fileUrl || body.blobUrl; // support both keys
      originalName = body.originalName || documentName;
      fileSize = body.fileSize || 0;
      fileType = body.fileType || "";
      if (!filePath) return NextResponse.json({ error: "fileUrl is required" }, { status: 400 });
    } else {
      // FormData upload (leads page) – store directly in GridFS
      const formData = await req.formData();
      const file = formData.get("file") as File;
      studentId = formData.get("studentId") as string | null;
      leadId = formData.get("leadId") as string | null;
      country = (formData.get("country") as string) || "";
      documentName = formData.get("name") as string;
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

      const db = mongoose.connection.db;
      if (!db) return NextResponse.json({ error: "DB not connected" }, { status: 500 });

      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "documents" });
      const uploadStream = bucket.openUploadStream(file.name, {
        metadata: { contentType: file.type, uploadedBy: session.user.id, originalName: file.name },
      });

      await new Promise<void>((resolve, reject) => {
        uploadStream.on("finish", resolve);
        uploadStream.on("error", reject);
        uploadStream.end(buffer);
      });

      filePath = `/api/documents/file/${uploadStream.id.toString()}`;
      originalName = file.name;
      fileSize = file.size;
      fileType = file.type;
    }

    if (!studentId && !leadId) return NextResponse.json({ error: "studentId or leadId required" }, { status: 400 });

    const docData: Record<string, unknown> = {
      name: documentName || originalName,
      originalName,
      filePath,
      fileSize,
      fileType,
      uploadedBy: session.user.id,
    };
    if (studentId) { docData.student = studentId; docData.country = country; }
    if (leadId) docData.lead = leadId;

    const doc = await StudentDocument.create(docData);

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "UPLOAD",
      module: "Documents",
      targetId: doc._id.toString(),
      targetName: documentName || originalName,
      details: studentId
        ? `Document uploaded for student ${studentId}, country ${country}`
        : `Document uploaded for lead ${leadId}`,
    });

    return NextResponse.json({ message: "Document uploaded", document: doc }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents error:", err);
    const message = err instanceof Error ? err.message : "Failed to upload document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
