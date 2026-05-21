import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import Commission from "@/models/Commission";
import ActivityLog from "@/models/ActivityLog";
import { hasPermission } from "@/lib/utils";
import { findCommissionInTenant } from "@/lib/tenantRecordAccess";

function canUseCommission(session: NonNullable<Awaited<ReturnType<typeof auth>>>): boolean {
  if (session.user.role === "super_admin") return true;
  return hasPermission(session.user.permissions ?? [], "commission", session.user.role);
}

function commissionUpdateFromBody(body: Record<string, unknown>) {
  return {
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
    oshcName: body.oshcName ?? "",
    oshcAmount: String(body.oshcAmount ?? "").trim(),
    oshcClaim: body.oshcClaim ?? "",
    b2bName: String(body.b2bName ?? ""),
    b2bChannel: body.b2bChannel ?? "",
    commissionAmount: String(body.commissionAmount ?? ""),
    remarksStatus: body.remarksStatus ?? "",
    commissionStatus: body.commissionStatus ?? "",
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canUseCommission(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await connectDB();
    const doc = await findCommissionInTenant(session, id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ commission: typeof doc.toObject === "function" ? doc.toObject() : doc });
  } catch (e) {
    console.error("GET /api/commissions/[id]", e);
    return NextResponse.json({ error: "Failed to load commission" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canUseCommission(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await connectDB();
    const existing = await findCommissionInTenant(session, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    const $set = commissionUpdateFromBody(body);

    const doc = await Commission.findByIdAndUpdate(id, { $set }, { new: true, runValidators: false }).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "UPDATE",
      module: "Commission",
      targetId: id,
      targetName: doc.applicantName,
      details: `Updated commission - ${doc.destinationCountry} / ${doc.universityName}`,
    });

    return NextResponse.json({ commission: doc });
  } catch (e) {
    console.error("PATCH /api/commissions/[id]", e);
    return NextResponse.json({ error: "Failed to update commission" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canUseCommission(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await connectDB();
    const existing = await findCommissionInTenant(session, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await Commission.deleteOne({ _id: id });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "DELETE",
      module: "Commission",
      targetId: id,
      targetName: existing.applicantName,
      details: `Deleted commission - ${existing.destinationCountry} / ${existing.universityName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/commissions/[id]", e);
    return NextResponse.json({ error: "Failed to delete commission" }, { status: 500 });
  }
}
