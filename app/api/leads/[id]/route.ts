import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Lead from "@/models/Lead";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import { createNotifications, getSuperAdminIds } from "@/lib/notifications";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const lead = await Lead.findById(id)
      .populate("branch", "name location")
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name");
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch {
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await connectDB();
    const body = await req.json();

    if (session.user.role === "front_desk" && body.stage) {
      return NextResponse.json({ error: "Front desk users cannot update stage" }, { status: 403 });
    }

    // Snapshot old assignedTo before updating
    const oldLead = await Lead.findById(id).select("assignedTo name").lean();
    const oldAssignedTo = oldLead?.assignedTo?.toString();

    // Use $set to only update provided fields — prevents wiping status/stage/remarks
    // when the edit form doesn't include them
    const setFields = { ...body };
    // Remove empty ObjectId refs so Mongoose doesn't reject them
    if (!setFields.assignedTo) delete setFields.assignedTo;
    if (!setFields.branch) delete setFields.branch;

    const lead = await Lead.findByIdAndUpdate(id, { $set: setFields }, { new: true, runValidators: false });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "UPDATE",
      module: "Leads",
      targetId: lead._id.toString(),
      targetName: lead.name,
      details: `Updated lead: ${JSON.stringify(body)}`,
    });

    // Fire notification if counsellor assignment changed
    const newAssignedTo = body.assignedTo?.toString();
    if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
      const adminIds = await getSuperAdminIds();
      const recipientIds = [...new Set([newAssignedTo, ...adminIds])];
      await createNotifications({
        recipientIds,
        type: "lead_assigned",
        title: "Lead Assigned",
        message: `${session.user.name} assigned lead "${lead.name}" to you`,
        link: `/leads/${lead._id}`,
        createdBy: session.user.id,
      });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error("Update lead error:", error);
    const message = error instanceof Error ? error.message : "Failed to update lead";
    return NextResponse.json({ error: `Failed to update lead: ${message}` }, { status: 500 });
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

    // Front desk users: only update status, not stage
    if (session.user.role === "front_desk") {
      if (body.status) {
        update.status = body.status;
        const entered = resolveStatusEnteredAt();
        if (entered === null && typeof body.statusDate === "string" && body.statusDate.trim() !== "") {
          return NextResponse.json({ error: "Invalid status date" }, { status: 400 });
        }
        update[`statusDates.${body.status}`] = entered ?? new Date();
      }
      // Remove stage if accidentally provided
      if (body.stage) {
        return NextResponse.json({ error: "Front desk users cannot update stage" }, { status: 403 });
      }
    } 
    // Super admin, counsellors, and telecallers: can update both status and stage
    else if (
      session.user.role === "super_admin" ||
      session.user.role === "counsellor" ||
      session.user.role === "telecaller"
    ) {
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
    }
    // Other users: only update stage, not status
    else {
      if (body.stage) {
        update.stage = body.stage;
        update[`stageDates.${body.stage}`] = new Date();
      }
      // Remove status if accidentally provided
      if (body.status) {
        return NextResponse.json({ error: "Only front desk, counsellors and admin can update status" }, { status: 403 });
      }
    }

    // Allow other fields like assignedTo, notes, etc for all users
    const allowedFields = ["assignedTo", "assignedBy", "standing", "interestedCountry", "interestedService", "comments", "notes"];
    for (const field of allowedFields) {
      if (field in body) {
        update[field] = body[field];
      }
    }

    const oldLead = await Lead.findById(id).select("assignedTo name").lean();
    const oldAssignedTo = oldLead?.assignedTo?.toString();

    const lead = await Lead.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const newAssignedTo =
      body.assignedTo !== undefined && body.assignedTo !== null
        ? String(body.assignedTo)
        : undefined;
    if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
      const adminIds = await getSuperAdminIds();
      const recipientIds = [...new Set([newAssignedTo, ...adminIds])];
      await createNotifications({
        recipientIds,
        type: "lead_assigned",
        title: "Lead Assigned",
        message: `${session.user.name} assigned lead "${lead.name}" to you`,
        link: `/leads/${lead._id}`,
        createdBy: session.user.id,
      });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error("Patch lead error:", error);
    const message = error instanceof Error ? error.message : "Failed to update lead";
    return NextResponse.json({ error: `Failed to update lead: ${message}` }, { status: 500 });
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
    await Lead.findByIdAndDelete(id);
    return NextResponse.json({ message: "Lead deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
