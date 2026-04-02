import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ActivityLog from "@/models/ActivityLog";
import { auth } from "@/lib/auth";
import AppSettings from "@/models/AppSettings";
import { isRoleSlugAllowed, normalizeApplicationRoles } from "@/lib/applicationRoles";

function canManageUsers(session: { user: { role: string; permissions?: string[] } }): boolean {
  if (session.user.role === "super_admin") return true;
  return (session.user.permissions ?? []).includes("users");
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
    const body = await req.json();

    if (body.role !== undefined) {
      const settingsDoc = await AppSettings.findOne().lean();
      const roleCatalog = normalizeApplicationRoles(settingsDoc?.applicationRoles);
      if (!isRoleSlugAllowed(String(body.role), roleCatalog)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
    }

    if (session.user.role !== "super_admin") {
      const target = await User.findById(id).select("role").lean();
      if (target?.role === "super_admin") {
        return NextResponse.json({ error: "Only super admins can edit super admin accounts" }, { status: 403 });
      }
      if (body.role === "super_admin") {
        return NextResponse.json({ error: "Only super admins can assign the super admin role" }, { status: 403 });
      }
    }

    const isPasswordReset = !!body.password;
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
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

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !canManageUsers(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await connectDB();

    if (session.user.role !== "super_admin") {
      const target = await User.findById(id).select("role").lean();
      if (target?.role === "super_admin") {
        return NextResponse.json({ error: "Only super admins can deactivate super admin accounts" }, { status: 403 });
      }
    }

    await User.findByIdAndUpdate(id, { isActive: false });
    return NextResponse.json({ message: "User deactivated" });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
