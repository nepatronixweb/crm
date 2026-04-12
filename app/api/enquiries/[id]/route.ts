import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Enquiry from "@/models/Enquiry";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import { createNotifications, getSuperAdminIds } from "@/lib/notifications";
import { LEAD_PATCH_FD_STATUS_AND_STAGE_ROLES } from "@/lib/leadWorkflowStatusRoles";

function canAccessEnquiry(
  role: string,
  userId: string,
  assignedToId: string | undefined
): boolean {
  if (role === "super_admin" || role === "telecaller") return true;
  if (role === "counsellor" && assignedToId === userId) return true;
  return false;
}

function populatedRefId(ref: unknown): string | undefined {
  if (ref == null) return undefined;
  if (typeof ref === "object" && "_id" in (ref as object)) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const enquiry = await Enquiry.findById(id)
      .populate("branch", "name location")
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name");
    if (!enquiry) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
    const assignedToId = populatedRefId(enquiry.assignedTo);
    if (!canAccessEnquiry(session.user.role, session.user.id, assignedToId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(enquiry);
  } catch {
    return NextResponse.json({ error: "Failed to fetch enquiry" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();

    const existing = await Enquiry.findById(id).select("assignedTo name").lean();
    if (!existing) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
    const existingAssigned = existing.assignedTo?.toString();
    if (!canAccessEnquiry(session.user.role, session.user.id, existingAssigned)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const setFields = { ...body };
    if (!setFields.assignedTo) delete setFields.assignedTo;
    if (!setFields.branch) delete setFields.branch;

    const oldAssignedTo = existingAssigned;
    const enquiry = await Enquiry.findByIdAndUpdate(id, { $set: setFields }, { new: true, runValidators: false });
    if (!enquiry) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "UPDATE",
      module: "Enquiries",
      targetId: enquiry._id.toString(),
      targetName: enquiry.name,
      details: `Updated enquiry: ${JSON.stringify(body)}`,
    });

    const newAssignedTo = body.assignedTo?.toString();
    if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
      const adminIds = await getSuperAdminIds();
      const recipientIds = [...new Set([newAssignedTo, ...adminIds])];
      await createNotifications({
        recipientIds,
        type: "lead_assigned",
        title: "Enquiry assigned",
        message: `${session.user.name} assigned enquiry "${enquiry.name}" to you`,
        link: `/enquiries/${enquiry._id}`,
        createdBy: session.user.id,
      });
    }

    return NextResponse.json(enquiry);
  } catch (error) {
    console.error("Update enquiry error:", error);
    const message = error instanceof Error ? error.message : "Failed to update enquiry";
    return NextResponse.json({ error: `Failed to update enquiry: ${message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

    const resolveStatusEnteredAt = (): Date | null => {
      if (typeof body.statusDate === "string" && body.statusDate.trim() !== "") {
        const d = new Date(body.statusDate.trim());
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    const pre = await Enquiry.findById(id).select("assignedTo name").lean();
    if (!pre) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
    const preAssigned = pre.assignedTo?.toString();
    if (!canAccessEnquiry(session.user.role, session.user.id, preAssigned)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (LEAD_PATCH_FD_STATUS_AND_STAGE_ROLES.has(session.user.role)) {
      if (body.status) {
        update.status = body.status;
        const entered = resolveStatusEnteredAt();
        if (entered === null && typeof body.statusDate === "string" && body.statusDate.trim() !== "") {
          return NextResponse.json({ error: "Invalid status date" }, { status: 400 });
        }
        update[`statusDates.${body.status}`] = entered ?? new Date();
      }
      if (body.stage) {
        update.stage = body.stage;
        update[`stageDates.${body.stage}`] = new Date();
      }
    } else {
      if (body.stage) {
        update.stage = body.stage;
        update[`stageDates.${body.stage}`] = new Date();
      }
      if (body.status) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const allowedFields = ["assignedTo", "assignedBy", "standing", "interestedCountry", "interestedService", "comments", "notes"];
    for (const field of allowedFields) {
      if (field in body) {
        update[field] = body[field];
      }
    }

    const oldAssignedTo = preAssigned;
    const enquiry = await Enquiry.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!enquiry) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });

    const newAssignedTo =
      body.assignedTo !== undefined && body.assignedTo !== null ? String(body.assignedTo) : undefined;
    if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
      const adminIds = await getSuperAdminIds();
      const recipientIds = [...new Set([newAssignedTo, ...adminIds])];
      await createNotifications({
        recipientIds,
        type: "lead_assigned",
        title: "Enquiry assigned",
        message: `${session.user.name} assigned enquiry "${enquiry.name}" to you`,
        link: `/enquiries/${enquiry._id}`,
        createdBy: session.user.id,
      });
    }

    return NextResponse.json(enquiry);
  } catch (error) {
    console.error("Patch enquiry error:", error);
    const message = error instanceof Error ? error.message : "Failed to update enquiry";
    return NextResponse.json({ error: `Failed to update enquiry: ${message}` }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await connectDB();
    await Enquiry.findByIdAndDelete(id);
    return NextResponse.json({ message: "Enquiry deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete enquiry" }, { status: 500 });
  }
}
