import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Commission from "@/models/Commission";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/utils";
import {
  backfillTenantCommissionOrganizations,
  organizationIdForSessionCreate,
  tenantCommissionScopeForSession,
} from "@/lib/tenantRecordAccess";

function canUseCommission(session: NonNullable<Awaited<ReturnType<typeof auth>>>): boolean {
  if (session.user.role === "super_admin") return true;
  return hasPermission(session.user.permissions ?? [], "commission", session.user.role);
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !canUseCommission(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    await backfillTenantCommissionOrganizations(session);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));
    const skip = (page - 1) * limit;

    const filter = await tenantCommissionScopeForSession(session);

    const [rows, total] = await Promise.all([
      Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Commission.countDocuments(filter),
    ]);

    return NextResponse.json({ commissions: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    console.error("GET /api/commissions", e);
    return NextResponse.json({ error: "Failed to load commissions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !canUseCommission(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const body = await req.json();

    const organization = organizationIdForSessionCreate(session);
    if (session.user.role !== "super_admin" && !organization) {
      return NextResponse.json({ error: "Organization required" }, { status: 403 });
    }

    const doc = await Commission.create({
      destinationCountry: String(body.destinationCountry ?? "").trim(),
      applicantName: String(body.applicantName ?? "").trim(),
      studentId: String(body.studentId ?? "").trim(),
      universityName: String(body.universityName ?? "").trim(),
      courseStartDate: String(body.courseStartDate ?? ""),
      courseEndDate: String(body.courseEndDate ?? ""),
      courseAnnualFee: String(body.courseAnnualFee ?? ""),
      tuitionFeePaid: String(body.tuitionFeePaid ?? ""),
      commissionPercent: Number(body.commissionPercent) || 0,
      currencySymbol: String(body.currencySymbol ?? ""),
      amountFromPercent: String(body.amountFromPercent ?? ""),
      intakeQuarter: body.intakeQuarter ?? "",
      intakeYear: String(body.intakeYear ?? ""),
      commission: String(body.commission ?? ""),
      claim: String(body.claim ?? ""),
      claimableIntake: body.claimableIntake ?? "",
      commissionDuration: body.commissionDuration ?? "",
      incentives: String(body.incentives ?? "").trim(),
      marketingBudget: "",
      oshcName: body.oshcName ?? "",
      oshcAmount: String(body.oshcAmount ?? "").trim(),
      oshcClaim: body.oshcClaim ?? "",
      b2bName: String(body.b2bName ?? ""),
      b2bChannel: body.b2bChannel ?? "",
      commissionAmount: String(body.commissionAmount ?? ""),
      remarksStatus: body.remarksStatus ?? "",
      commissionStatus: body.commissionStatus ?? "",
      organization,
      createdBy: session.user.id,
      createdByName: session.user.name ?? "",
    });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "CREATE",
      module: "Commission",
      targetId: doc._id.toString(),
      targetName: doc.applicantName,
      details: `Commission entry - ${doc.destinationCountry} / ${doc.universityName}`,
    });

    return NextResponse.json({ commission: doc }, { status: 201 });
  } catch (e) {
    console.error("POST /api/commissions", e);
    return NextResponse.json({ error: "Failed to save commission" }, { status: 500 });
  }
}
