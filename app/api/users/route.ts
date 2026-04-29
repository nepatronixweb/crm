import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import Branch from "@/models/Branch";
import { getAppSettingsLeanForOrganizationId } from "@/lib/appSettingsScope";
import { isRoleSlugAllowed, normalizeApplicationRoles } from "@/lib/applicationRoles";
import { getBranchIdsInOrganization, isBranchInOrganization } from "@/lib/orgUserScope";

function canManageUsers(session: { user: { role: string; permissions?: string[] } }): boolean {
  if (session.user.role === "super_admin") return true;
  return (session.user.permissions ?? []).includes("users");
}

function sanitizeDashboardWidgets(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const o: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k).slice(0, 128);
    if (typeof v === "boolean") o[key] = v;
  }
  return o;
}

function sanitizeDashboardOrder(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const o: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k).slice(0, 64);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      o[key] = v.map((x) => String(x).slice(0, 128));
    }
  }
  return o;
}

function normalizeRolesPayload(rawRoles: unknown, fallbackRole: string): string[] {
  const arr = Array.isArray(rawRoles)
    ? rawRoles.map((r) => String(r).trim()).filter(Boolean)
    : [];
  const merged = Array.from(new Set([...(arr.length > 0 ? arr : []), fallbackRole].filter(Boolean)));
  return merged;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { searchParams } = new URL(req.url);
    const roleFilter = searchParams.get("role");

    if (roleFilter === "counsellor") {
      if (session.user.role === "super_admin") {
        const counsellors = await User.find({
          isActive: true,
          $or: [{ role: "counsellor" }, { roles: "counsellor" }],
        })
          .populate("branch", "name")
          .select("_id name email role branch")
          .sort({ name: 1 });
        return NextResponse.json(counsellors);
      }
      const orgId = session.user.organizationId;
      if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
        return NextResponse.json([]);
      }
      const orgOid = new mongoose.Types.ObjectId(orgId);
      const branchIds = await getBranchIdsInOrganization(orgId);

      // Never use branch: { $in: [] } — it matches no documents. If the org branch
      // index is empty (legacy data), resolve counsellors via Branch.organization on lookup.
      if (branchIds.length === 0) {
        const viaOrg = await User.aggregate([
          {
            $match: {
              isActive: true,
              branch: { $exists: true, $ne: null },
              $or: [{ role: "counsellor" }, { roles: "counsellor" }],
            },
          },
          {
            $lookup: {
              from: "branches",
              localField: "branch",
              foreignField: "_id",
              as: "br",
            },
          },
          { $unwind: "$br" },
          { $match: { "br.organization": orgOid } },
          { $sort: { name: 1 } },
          { $project: { _id: 1, name: 1, email: 1, role: 1, branch: 1 } },
        ]);
        if (viaOrg.length > 0) {
          return NextResponse.json(viaOrg);
        }
        const viewerBranch = session.user.branch;
        if (viewerBranch && mongoose.Types.ObjectId.isValid(viewerBranch)) {
          const fallback = await User.find({
            isActive: true,
            $or: [{ role: "counsellor" }, { roles: "counsellor" }],
            branch: new mongoose.Types.ObjectId(viewerBranch),
          })
            .populate("branch", "name")
            .select("_id name email role branch")
            .sort({ name: 1 })
            .lean();
          return NextResponse.json(fallback);
        }
        return NextResponse.json([]);
      }

      const counsellors = await User.find({
        isActive: true,
        $or: [{ role: "counsellor" }, { roles: "counsellor" }],
        branch: { $in: branchIds },
      })
        .populate("branch", "name")
        .select("_id name email role branch")
        .sort({ name: 1 });
      return NextResponse.json(counsellors);
    }

    if (!canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const listFilter =
      session.user.role === "super_admin"
        ? {}
        : session.user.organizationId
          ? { branch: { $in: await getBranchIdsInOrganization(session.user.organizationId) } }
          : { _id: { $exists: false } };

    const users = await User.find(listFilter).populate("branch", "name").select("-password").sort({ createdAt: -1 });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const body = await req.json();
    const {
      name,
      email,
      password,
      role,
      roles,
      activeRole,
      branch,
      dateOfBirth,
      phone,
      target,
      permissions,
      hrRole,
      monthlySalary,
      workingDays,
      workingHoursPerDay,
      officeNetworkIp,
    } = body;

    if (role === "super_admin" && session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admins can create super admin accounts" }, { status: 403 });
    }

    if (session.user.role !== "super_admin") {
      if (!session.user.organizationId) {
        return NextResponse.json({ error: "Organization context required" }, { status: 403 });
      }
      if (!branch) {
        return NextResponse.json({ error: "Branch is required" }, { status: 400 });
      }
      const inOrg = await isBranchInOrganization(String(branch), session.user.organizationId);
      if (!inOrg) {
        return NextResponse.json({ error: "Branch is not in your organization" }, { status: 403 });
      }
    }

    let orgIdForCatalog: string | null = session.user.organizationId ?? null;
    if (branch) {
      const br = await Branch.findById(branch).select("organization").lean();
      if (br?.organization) orgIdForCatalog = br.organization.toString();
    }
    const settingsDoc = await getAppSettingsLeanForOrganizationId(orgIdForCatalog);
    const roleCatalog = normalizeApplicationRoles(settingsDoc?.applicationRoles);
    if (!isRoleSlugAllowed(String(role), roleCatalog)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const normalizedRoles = normalizeRolesPayload(roles, String(role));
    for (const roleSlug of normalizedRoles) {
      if (!isRoleSlugAllowed(roleSlug, roleCatalog)) {
        return NextResponse.json({ error: `Invalid role in roles: ${roleSlug}` }, { status: 400 });
      }
    }
    const normalizedActiveRole =
      typeof activeRole === "string" && normalizedRoles.includes(activeRole.trim())
        ? activeRole.trim()
        : String(role);

    const existing = await User.findOne({ email });
    if (existing) return NextResponse.json({ error: "Email already exists" }, { status: 400 });

    const hashed = await bcrypt.hash(password, 10);
    const dashboardWidgets = sanitizeDashboardWidgets(body.dashboardWidgets);
    const dashboardWidgetOrder = sanitizeDashboardOrder(body.dashboardWidgetOrder);
    const hrPayload: Record<string, unknown> = {};
    if (session.user.role === "super_admin") {
      if (hrRole === "admin" || hrRole === "employee") hrPayload.hrRole = hrRole;
      if (typeof monthlySalary === "number" && monthlySalary >= 0) hrPayload.monthlySalary = monthlySalary;
      if (typeof workingDays === "number" && workingDays >= 1) hrPayload.workingDays = workingDays;
      if (typeof workingHoursPerDay === "number" && workingHoursPerDay >= 0 && workingHoursPerDay <= 24) {
        hrPayload.workingHoursPerDay = workingHoursPerDay;
      }
      if (typeof officeNetworkIp === "string") {
        hrPayload.officeNetworkIp = officeNetworkIp.trim().slice(0, 128);
      }
    }
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      roles: normalizedRoles,
      activeRole: normalizedActiveRole,
      permissions: Array.isArray(permissions) ? permissions : [],
      branch,
      dateOfBirth,
      phone,
      target,
      dashboardWidgets,
      dashboardWidgetOrder,
      ...hrPayload,
    });

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: "CREATE",
      module: "Users",
      targetId: user._id.toString(),
      targetName: user.name,
      details: `Created user with role ${role}`,
    });

    return NextResponse.json({ message: "User created", user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
