import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import User from "@/models/User";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedRole = String((body as { activeRole?: unknown })?.activeRole ?? "").trim();
    if (!requestedRole) {
      return NextResponse.json({ error: "activeRole is required" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(session.user.id).select("role roles activeRole");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const roles = Array.isArray((user as { roles?: unknown }).roles)
      ? ((user as { roles?: unknown }).roles as unknown[]).map((r) => String(r).trim()).filter(Boolean)
      : [];
    const legacyRole = String((user as { role?: unknown }).role ?? "").trim();
    const allowedRoles = Array.from(new Set([...(roles.length > 0 ? roles : []), ...(legacyRole ? [legacyRole] : [])]));
    if (!allowedRoles.includes(requestedRole)) {
      return NextResponse.json({ error: "Role is not assigned to this user" }, { status: 403 });
    }

    (user as { activeRole?: string }).activeRole = requestedRole;
    if (!Array.isArray((user as { roles?: unknown }).roles) || roles.length === 0) {
      (user as { roles?: string[] }).roles = allowedRoles;
    }
    await user.save();
    return NextResponse.json({ activeRole: requestedRole, roles: allowedRoles });
  } catch {
    return NextResponse.json({ error: "Failed to switch active role" }, { status: 500 });
  }
}
