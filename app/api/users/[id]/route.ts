import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import { getAppSettingsLeanForOrganizationId } from "@/lib/appSettingsScope";
import { isRoleSlugAllowed, normalizeApplicationRoles } from "@/lib/applicationRoles";
import { isBranchInOrganization, isUserInOrganization } from "@/lib/orgUserScope";

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
  return Array.from(new Set([...(arr.length > 0 ? arr : []), fallbackRole].filter(Boolean)));
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await connectDB();
    const user = await User.findById(id).populate("branch", "name").select("-password");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (session.user.role !== "super_admin") {
      if (!session.user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const allowed = await isUserInOrganization(id, session.user.organizationId);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await connectDB();

    if (session.user.role !== "super_admin") {
      if (!session.user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const allowed = await isUserInOrganization(id, session.user.organizationId);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();

    if (
      body.hrRole !== undefined ||
      body.monthlySalary !== undefined ||
      body.workingDays !== undefined ||
      body.workingHoursPerDay !== undefined ||
      body.officeNetworkIp !== undefined
    ) {
      if (session.user.role !== "super_admin") {
        return NextResponse.json(
          { error: "Only super admins can edit HR fields (salary, working days, hours, network IP, hrRole)" },
          { status: 403 }
        );
      }
      if (body.hrRole !== undefined && body.hrRole !== "admin" && body.hrRole !== "employee") {
        return NextResponse.json({ error: "Invalid hrRole" }, { status: 400 });
      }
      if (body.monthlySalary !== undefined && (typeof body.monthlySalary !== "number" || body.monthlySalary < 0)) {
        return NextResponse.json({ error: "Invalid monthlySalary" }, { status: 400 });
      }
      if (body.workingDays !== undefined && (typeof body.workingDays !== "number" || body.workingDays < 1)) {
        return NextResponse.json({ error: "Invalid workingDays" }, { status: 400 });
      }
      if (
        body.workingHoursPerDay !== undefined &&
        (typeof body.workingHoursPerDay !== "number" || body.workingHoursPerDay < 0 || body.workingHoursPerDay > 24)
      ) {
        return NextResponse.json({ error: "Invalid workingHoursPerDay (0-24)" }, { status: 400 });
      }
      if (body.officeNetworkIp !== undefined && typeof body.officeNetworkIp !== "string") {
        return NextResponse.json({ error: "Invalid officeNetworkIp" }, { status: 400 });
      }
    }

    if (session.user.role !== "super_admin") {
      delete body.hrRole;
      delete body.monthlySalary;
      delete body.workingDays;
      delete body.workingHoursPerDay;
      delete body.officeNetworkIp;
    } else if (typeof body.officeNetworkIp === "string") {
      body.officeNetworkIp = body.officeNetworkIp.trim().slice(0, 128);
    }

    if (body.role !== undefined) {
      const targetUser = await User.findById(id).populate<{ branch: { organization?: { toString(): string } } | null }>(
        "branch",
        "organization"
      );
      let orgIdForCatalog: string | null = session.user.organizationId ?? null;
      const br = targetUser?.branch;
      if (br && typeof br === "object" && br.organization) {
        orgIdForCatalog = br.organization.toString();
      }
      const settingsDoc = await getAppSettingsLeanForOrganizationId(orgIdForCatalog);
      const roleCatalog = normalizeApplicationRoles(settingsDoc?.applicationRoles);
      if (!isRoleSlugAllowed(String(body.role), roleCatalog)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      if (body.roles !== undefined) {
        const normalizedRoles = normalizeRolesPayload(body.roles, String(body.role));
        for (const roleSlug of normalizedRoles) {
          if (!isRoleSlugAllowed(roleSlug, roleCatalog)) {
            return NextResponse.json({ error: `Invalid role in roles: ${roleSlug}` }, { status: 400 });
          }
        }
        body.roles = normalizedRoles;
        if (typeof body.activeRole !== "string" || !normalizedRoles.includes(body.activeRole.trim())) {
          body.activeRole = String(body.role);
        } else {
          body.activeRole = body.activeRole.trim();
        }
      }
    }

    if (body.role === undefined && body.roles !== undefined) {
      const current = await User.findById(id).select("role branch").populate<{ branch: { organization?: { toString(): string } } | null }>(
        "branch",
        "organization"
      );
      const fallbackRole = String(current?.role ?? "").trim();
      const normalizedRoles = normalizeRolesPayload(body.roles, fallbackRole);
      let orgIdForCatalog: string | null = session.user.organizationId ?? null;
      const br = current?.branch;
      if (br && typeof br === "object" && br.organization) {
        orgIdForCatalog = br.organization.toString();
      }
      const settingsDoc = await getAppSettingsLeanForOrganizationId(orgIdForCatalog);
      const roleCatalog = normalizeApplicationRoles(settingsDoc?.applicationRoles);
      for (const roleSlug of normalizedRoles) {
        if (!isRoleSlugAllowed(roleSlug, roleCatalog)) {
          return NextResponse.json({ error: `Invalid role in roles: ${roleSlug}` }, { status: 400 });
        }
      }
      body.roles = normalizedRoles;
      if (typeof body.activeRole !== "string" || !normalizedRoles.includes(body.activeRole.trim())) {
        body.activeRole = normalizedRoles[0] || fallbackRole;
      } else {
        body.activeRole = body.activeRole.trim();
      }
    }

    if (session.user.role !== "super_admin") {
      const target = await User.findById(id).select("role roles").lean();
      const targetRoles = Array.isArray((target as { roles?: unknown })?.roles)
        ? ((target as { roles?: unknown }).roles as unknown[]).map((r) => String(r))
        : [];
      if (target?.role === "super_admin" || targetRoles.includes("super_admin")) {
        return NextResponse.json({ error: "Only super admins can edit super admin accounts" }, { status: 403 });
      }
      if (body.role === "super_admin") {
        return NextResponse.json({ error: "Only super admins can assign the super admin role" }, { status: 403 });
      }
    }

    if (session.user.role !== "super_admin" && session.user.organizationId && body.branch !== undefined) {
      const raw = body.branch;
      if (raw === null || raw === "") {
        return NextResponse.json({ error: "Branch is required" }, { status: 400 });
      }
      const inOrg = await isBranchInOrganization(String(raw), session.user.organizationId);
      if (!inOrg) {
        return NextResponse.json({ error: "Branch is not in your organization" }, { status: 403 });
      }
    }

    const isPasswordReset = !!body.password;
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    if (body.dashboardWidgets !== undefined) {
      body.dashboardWidgets = sanitizeDashboardWidgets(body.dashboardWidgets);
    }
    if (body.dashboardWidgetOrder !== undefined) {
      body.dashboardWidgetOrder = sanitizeDashboardOrder(body.dashboardWidgetOrder);
    }
    const user = await User.findByIdAndUpdate(id, body, { new: true }).select("-password");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const action = isPasswordReset ? "PASSWORD_RESET" : "UPDATE";
    const details = isPasswordReset
      ? `Reset password for ${user.name}`
      : `Updated user ${user.name}`;

    await ActivityLog.create({
      user: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action,
      module: "Users",
      targetId: user._id.toString(),
      targetName: user.name,
      details,
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await connectDB();

    if (id === session.user.id) {
      return NextResponse.json({ error: "You cannot remove or deactivate your own account" }, { status: 400 });
    }

    const permanent = new URL(req.url).searchParams.get("permanent") === "1";

    if (permanent) {
      if (session.user.role !== "super_admin") {
        return NextResponse.json({ error: "Only super admins can permanently delete users" }, { status: 403 });
      }
      const existing = await User.findById(id).select("name email").lean();
      if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });
      await User.findByIdAndDelete(id);
      await ActivityLog.create({
        user: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action: "DELETE",
        module: "Users",
        targetId: id,
        targetName: existing.name,
        details: `Permanently deleted user ${existing.email}`,
      });
      return NextResponse.json({ message: "User removed", permanent: true });
    }

    if (session.user.role !== "super_admin") {
      if (!session.user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const allowed = await isUserInOrganization(id, session.user.organizationId);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const target = await User.findById(id).select("role roles").lean();
      const targetRoles = Array.isArray((target as { roles?: unknown })?.roles)
        ? ((target as { roles?: unknown }).roles as unknown[]).map((r) => String(r))
        : [];
      if (target?.role === "super_admin" || targetRoles.includes("super_admin")) {
        return NextResponse.json({ error: "Only super admins can deactivate super admin accounts" }, { status: 403 });
      }
    }

    await User.findByIdAndUpdate(id, { isActive: false });
    return NextResponse.json({ message: "User deactivated" });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
