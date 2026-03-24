import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Student from "@/models/Student";
import Lead from "@/models/Lead";
import User from "@/models/User";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();

    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch");
    const stage = searchParams.get("stage");
    const counsellor = searchParams.get("counsellor");
    const country = searchParams.get("country");
    const leadId = searchParams.get("leadId");
    const standing = searchParams.get("standing");
    const enrolled = searchParams.get("enrolled");
    const source = searchParams.get("source");
    const crmStage = searchParams.get("crmStage"); // student.stage (CRM pipeline tag)
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (session.user.role === "counsellor") filter.counsellor = session.user.id;
    else if (session.user.role !== "super_admin") filter.branch = session.user.branch;

    if (branch) filter.branch = branch;
    if (stage) filter.currentStage = stage;
    if (counsellor) filter.counsellor = counsellor;
    if (country) filter["countries.country"] = country;
    if (leadId) { filter.lead = leadId; delete filter.branch; delete filter.counsellor; }
    if (standing) filter.standing = standing;
    if (enrolled === "true") filter.enrolled = true;
    if (source) filter.source = source;
    if (crmStage) filter.stage = crmStage;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ name: regex }, { phone: regex }, { email: regex }];
    }

    const needsLead = !enrolled && !stage;
    const leadPopulate = needsLead
      ? { path: "lead", select: "source interestedService interestedCountry interestedCountries parentName parentPhone1 parentPhone2 academicScore academicInstitution temporaryAddress permanentAddress examType examScore examJoinDate examStartDate examEndDate examPaymentMethod examEstimatedDate gender maritalStatus nationality passportNumber visaExpiryDate senderName academicYear applyLevel course intakeYear intakeQuarter comments" }
      : { path: "lead", select: "_id" };

    const skip = (page - 1) * limit;
    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate("branch", "name")
        .populate("counsellor", "name email")
        .populate(leadPopulate)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);
    return NextResponse.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();

    const body = await req.json();

    // ── Mode 1: Direct creation (full form) ──────────────────────────────────
    if (body.direct) {
      const {
        name, phone, email, dateOfBirth, source,
        interestedService, interestedCountry,
        branch, counsellorId, comments,
      } = body;

      // Create lead first
      const lead = await Lead.create({
        name, phone, email, dateOfBirth, source,
        interestedService, interestedCountry,
        branch: branch || session.user.branch,
        status: "warm",
        assignedTo: counsellorId || undefined,
        assignedBy: counsellorId ? session.user.id : undefined,
        notes: comments ? [{ content: comments, addedBy: session.user.id, addedByName: session.user.name, addedByRole: session.user.role }] : [],
        convertedToStudent: true,
      });

      const counsellor = counsellorId || session.user.id;

      const student = await Student.create({
        lead: lead._id,
        name, phone, email, dateOfBirth, source,
        branch: branch || session.user.branch,
        counsellor,
        currentStage: "counsellor",
        countries: [{ country: interestedCountry, status: "counsellor" }],
      });

      await User.findByIdAndUpdate(counsellor, { $inc: { currentCount: 1 } });

      await ActivityLog.create({
        user: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action: "CREATE",
        module: "Students",
        targetId: student._id.toString(),
        targetName: student.name,
        details: `Student added directly for ${interestedCountry}`,
      });

      return NextResponse.json({ message: "Student created", student }, { status: 201 });
    }

    // ── Mode 2: Convert existing lead ────────────────────────────────────────
    const { leadId, country, countries: countriesInput } = body;

    const lead = await Lead.findById(leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (lead.convertedToStudent) return NextResponse.json({ error: "Lead already converted" }, { status: 400 });

    const counsellor = lead.assignedTo || session.user.id;

    // Try session branch first; if missing (stale token), do a fresh DB lookup
    let branch: mongoose.Types.ObjectId | string | undefined = lead.branch || session.user.branch;
    if (!branch) {
      const counsellorUser = await User.findById(counsellor).select("branch").lean();
      branch = (counsellorUser as { branch?: mongoose.Types.ObjectId })?.branch?.toString();
    }

    if (!branch) return NextResponse.json({ error: "No branch found. Please assign a branch to this lead or your user account, then try again." }, { status: 400 });
    if (!counsellor) return NextResponse.json({ error: "No counsellor assigned" }, { status: 400 });

    const VALID_SOURCES = ["walk_in", "facebook", "whatsapp", "instagram", "website", "referral", "other"];
    const source = VALID_SOURCES.includes(lead.source) ? lead.source : "other";

    // Support both legacy single-country and new multi-country format
    const countriesArray: { country: string; universityName?: string; status: string }[] =
      Array.isArray(countriesInput) && countriesInput.length > 0
        ? countriesInput.map((c: { country: string; universityName?: string }) => ({
            country: c.country,
            universityName: c.universityName || "",
            status: "counsellor",
          }))
        : [{ country: country || lead.interestedCountry, status: "counsellor" }];

    const student = await Student.create({
      lead: leadId,
      // Fallback for leads that were created with missing fields
      name: lead.name || lead.phone || lead.email || "Unknown Client",
      phone: lead.phone || "",
      email: lead.email || "",
      dateOfBirth: lead.dateOfBirth,
      source,
      branch,
      counsellor,
      currentStage: "counsellor",
      countries: countriesArray,
    });

    lead.convertedToStudent = true;
    await lead.save();

    await User.findByIdAndUpdate(counsellor, { $inc: { currentCount: 1 } });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "CONVERT",
      module: "Students",
      targetId: student._id.toString(),
      targetName: student.name,
      details: `Lead converted to student for ${country || lead.interestedCountry}`,
    });

    return NextResponse.json({ message: "Student created", student }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create student";
    console.error("[POST /api/students] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await connectDB();
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    await Student.deleteMany({ _id: { $in: ids } });
    return NextResponse.json({ message: `Deleted ${ids.length} students` });
  } catch {
    return NextResponse.json({ error: "Failed to delete students" }, { status: 500 });
  }
}
