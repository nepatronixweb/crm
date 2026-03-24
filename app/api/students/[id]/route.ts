import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Student from "@/models/Student";
import User from "@/models/User";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const student = await Student.findById(id)
      .populate("branch", "name location")
      .populate("counsellor", "name email")
      .lean();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    return NextResponse.json(student);
  } catch {
    return NextResponse.json({ error: "Failed to fetch student" }, { status: 500 });
  }
}

// Fields that are mirrored bidirectionally between the top-level student doc
// and every admissionDetails entry so all three views stay in sync.
const QUICK_SYNC_FIELDS = new Set(["stage", "remarks", "standing", "currentStage"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const body = await req.json();
    // Support raw MongoDB operators ($push, $pull, etc.) passed directly in the body
    const hasOperators = Object.keys(body).some((k) => k.startsWith("$"));

    let update: Record<string, unknown>;

    if (hasOperators) {
      update = body;
    } else {
      const setFields: Record<string, unknown> = { ...body };

      // Direction A: admissionDetails inline edit → mirror to top-level student fields
      // So that the students-list columns (stage/remarks/standing/currentStage) stay in sync.
      if (Array.isArray(body.admissionDetails) && body.admissionDetails.length > 0) {
        // Use the last non-closed entry as the primary source of truth
        const primary =
          [...body.admissionDetails].reverse().find((e: { closed?: boolean }) => !e.closed) ??
          body.admissionDetails[body.admissionDetails.length - 1];
        if (primary) {
          if (primary.stage    !== undefined && primary.stage    !== "") setFields.stage        = primary.stage;
          if (primary.remarks  !== undefined && primary.remarks  !== "") setFields.remarks      = primary.remarks;
          if (primary.standing !== undefined && primary.standing !== "") setFields.standing     = primary.standing;
          if (primary.pipeline !== undefined && primary.pipeline !== "") setFields.currentStage = primary.pipeline;
        }
      }

      // Direction B: students-list quick-update → mirror to ALL admissionDetails entries
      // Only when the patch is a "quick update" (touches only the 4 sync fields, no admissionDetails array).
      const bodyKeys = Object.keys(body);
      const isQuickSync =
        !body.admissionDetails &&
        bodyKeys.length > 0 &&
        bodyKeys.every((k) => QUICK_SYNC_FIELDS.has(k));

      if (isQuickSync) {
        if (body.stage        !== undefined) setFields["admissionDetails.$[].stage"]    = body.stage;
        if (body.remarks      !== undefined) setFields["admissionDetails.$[].remarks"]  = body.remarks;
        if (body.standing     !== undefined) setFields["admissionDetails.$[].standing"] = body.standing;
        if (body.currentStage !== undefined) setFields["admissionDetails.$[].pipeline"] = body.currentStage;
      }

      update = { $set: setFields };
    }

    const student = await Student.findByIdAndUpdate(id, update, { new: true, runValidators: false })
      .populate("branch", "name location")
      .populate("counsellor", "name email")
      .lean();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    return NextResponse.json(student);
  } catch (err) {
    console.error("PATCH /api/students/[id] error:", err);
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const body = await req.json();

    const student = await Student.findById(id);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // Check for visa approval → decrement counsellor target
    if (body.visaApproved) {
      await User.findByIdAndUpdate(student.counsellor, { $inc: { target: -1 } });
      await ActivityLog.create({
        user: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action: "VISA_APPROVED",
        module: "Students",
        targetId: id,
        targetName: student.name,
        details: `Visa approved for ${body.country}. Counsellor target decremented.`,
      });
    }

    const updated = await Student.findByIdAndUpdate(id, body, { new: true });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await connectDB();
    const student = await Student.findByIdAndDelete(id);
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "DELETE",
      module: "Students",
      targetId: id,
      targetName: student.name,
      details: `Deleted student ${student.name}`,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
