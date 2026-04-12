import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import AppSettings from "@/models/AppSettings";
import {
  APP_SETTINGS_PLATFORM_FILTER,
  getAppSettingsDocumentForSession,
} from "@/lib/appSettingsScope";

export const dynamic = "force-dynamic";

/** Dedupe case-insensitively; keep org-specific order first, then platform extras. */
function mergeB2bNameSuggestions(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of primary) {
    const n = String(raw ?? "").trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  for (const raw of secondary) {
    const n = String(raw ?? "").trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// GET — b2bNames for autocomplete. Org users merge tenant + platform lists so names
// saved under super_admin (platform) Settings still appear for admission/application/visa staff.
export async function GET() {
  try {
    await connectDB();
    const session = await auth();
    const s = await getAppSettingsDocumentForSession(session);
    const tenantNames = Array.isArray(s.b2bNames) ? s.b2bNames.map((x) => String(x)) : [];
    if (s.organization) {
      const plat = await AppSettings.findOne(APP_SETTINGS_PLATFORM_FILTER).select("b2bNames").lean();
      const platformNames = Array.isArray(plat?.b2bNames) ? plat.b2bNames.map((x) => String(x)) : [];
      return NextResponse.json({ b2bNames: mergeB2bNameSuggestions(tenantNames, platformNames) });
    }
    return NextResponse.json({ b2bNames: tenantNames });
  } catch (err) {
    console.error("GET /api/settings/b2b error:", err);
    return NextResponse.json({ b2bNames: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const canEdit = session && (session.user.role === "super_admin" || (session.user.permissions ?? []).includes("settings"));
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    await connectDB();
    const target = await getAppSettingsDocumentForSession(session);
    const result = await AppSettings.findByIdAndUpdate(
      target._id,
      { $addToSet: { b2bNames: name.trim() } },
      { new: true }
    );
    if (!result) return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    console.log("POST /api/settings/b2b: added", name, "=> b2bNames:", result.b2bNames);
    return NextResponse.json({ b2bNames: result.b2bNames });
  } catch (err) {
    console.error("POST /api/settings/b2b error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    const canEdit = session && (session.user.role === "super_admin" || (session.user.permissions ?? []).includes("settings"));
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    await connectDB();
    const target = await getAppSettingsDocumentForSession(session);
    const result = await AppSettings.findByIdAndUpdate(
      target._id,
      { $pull: { b2bNames: name.trim() } },
      { new: true }
    );
    console.log("DELETE /api/settings/b2b: removed", name, "=> b2bNames:", result?.b2bNames);
    return NextResponse.json({ b2bNames: result?.b2bNames || [] });
  } catch (err) {
    console.error("DELETE /api/settings/b2b error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
