import NextAuth, { NextAuthOptions, getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import AppSettings from "@/models/AppSettings";
import { normalizeApplicationRoles, resolveDefaultPermissionsForSlug } from "@/lib/applicationRoles";
import { checkRateLimit, clearRateLimit } from "@/lib/rateLimit";
import "@/models/Branch"; // register Branch schema for populate
import "@/models/Organization";
import {
  evaluateOrganizationAccess,
  shouldMarkTrialExpired,
} from "@/lib/organizationAccess";
import { ensureBranchLinkedToOrganization } from "@/lib/ensureBranchOrganization";
import type { DashboardWidgetOrderState } from "@/lib/dashboardLayout";

function dashboardWidgetsFromDoc(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") o[k] = v;
  }
  return Object.keys(o).length ? o : undefined;
}

function dashboardOrderFromDoc(raw: unknown): DashboardWidgetOrderState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o: DashboardWidgetOrderState = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      (o as Record<string, string[]>)[k] = v as string[];
    }
  }
  return Object.keys(o).length ? o : undefined;
}

/** Skip login rate limit on local dev (incl. `next start` where NODE_ENV may be production). */
function shouldSkipLoginRateLimit(): boolean {
  if (process.env.DISABLE_LOGIN_RATE_LIMIT === "true") return true;
  if (process.env.NODE_ENV === "development") return true;
  const base = process.env.NEXTAUTH_URL ?? "";
  return /localhost|127\.0\.0\.1/i.test(base);
}

function emailRegexCaseInsensitive(email: string): RegExp {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

/** Same rules as login: stored permissions if non-empty, else role defaults from AppSettings catalog (tenant or platform). */
export async function resolvePermissionsForDbUser(
  user: { permissions?: unknown; role: string; roles?: unknown },
  options?: { organizationId?: string | null }
): Promise<string[]> {
  const storedPerms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
  const orgId = options?.organizationId ?? null;
  let settingsRow = null;
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    settingsRow = await AppSettings.findOne({
      organization: new mongoose.Types.ObjectId(orgId),
    }).lean();
  }
  if (!settingsRow) {
    settingsRow = await AppSettings.findOne({ organization: null }).lean();
  }
  const roleCatalog = normalizeApplicationRoles(settingsRow?.applicationRoles);
  if (storedPerms.length > 0) return storedPerms;
  const roleSlugs = Array.isArray(user.roles)
    ? user.roles.map((r) => String(r).trim()).filter(Boolean)
    : [];
  const allRoles = roleSlugs.length > 0 ? roleSlugs : [String(user.role || "").trim()].filter(Boolean);
  const merged = new Set<string>();
  for (const slug of allRoles) {
    for (const p of resolveDefaultPermissionsForSlug(slug, roleCatalog)) merged.add(p);
  }
  return Array.from(merged);
}

function normalizeUserRolesShape(input: { role?: string | null; roles?: unknown; activeRole?: unknown }): {
  roles: string[];
  activeRole: string;
} {
  const fromArray = Array.isArray(input.roles)
    ? input.roles.map((r) => String(r).trim()).filter(Boolean)
    : [];
  const fromRole = String(input.role ?? "").trim();
  const merged = Array.from(new Set([...(fromArray.length > 0 ? fromArray : []), ...(fromRole ? [fromRole] : [])]));
  const activeRaw = String(input.activeRole ?? "").trim();
  const activeRole = merged.includes(activeRaw) ? activeRaw : merged[0] || fromRole || "";
  return { roles: merged, activeRole };
}

type OrgTokenFields = {
  organizationId: string | null;
  organizationName: string | null;
  orgSubscriptionStatus: string | null;
  orgTrialEndsAt: number | null;
  orgPaidThrough: number | null;
  orgAccessAllowed: boolean;
};

async function resolveOrgSubscriptionForUser(params: {
  role: string;
  branchId: string | undefined | null;
}): Promise<OrgTokenFields> {
  if (params.role === "super_admin") {
    return {
      organizationId: null,
      organizationName: null,
      orgSubscriptionStatus: null,
      orgTrialEndsAt: null,
      orgPaidThrough: null,
      orgAccessAllowed: true,
    };
  }

  if (!params.branchId) {
    return {
      organizationId: null,
      organizationName: null,
      orgSubscriptionStatus: null,
      orgTrialEndsAt: null,
      orgPaidThrough: null,
      orgAccessAllowed: false,
    };
  }

  const org = await ensureBranchLinkedToOrganization(params.branchId);
  if (!org) {
    return {
      organizationId: null,
      organizationName: null,
      orgSubscriptionStatus: null,
      orgTrialEndsAt: null,
      orgPaidThrough: null,
      orgAccessAllowed: false,
    };
  }

  if (shouldMarkTrialExpired(org)) {
    org.subscriptionStatus = "expired";
    await org.save();
  }

  const allowed = evaluateOrganizationAccess(org);

  return {
    organizationId: org._id.toString(),
    organizationName: org.name,
    orgSubscriptionStatus: org.subscriptionStatus,
    orgTrialEndsAt: org.trialEndsAt ? new Date(org.trialEndsAt).getTime() : null,
    orgPaidThrough: org.paidThrough ? new Date(org.paidThrough).getTime() : null,
    orgAccessAllowed: allowed,
  };
}

function applyOrgFieldsToToken(
  token: Record<string, unknown>,
  org: OrgTokenFields
): void {
  token.organizationId = org.organizationId;
  token.organizationName = org.organizationName;
  token.orgSubscriptionStatus = org.orgSubscriptionStatus;
  token.orgTrialEndsAt = org.orgTrialEndsAt;
  token.orgPaidThrough = org.orgPaidThrough;
  token.orgAccessAllowed = org.orgAccessAllowed;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;
          const emailInput = credentials.email.trim();
          const emailKey = `login:${emailInput.toLowerCase()}`;
          const enforceLoginRateLimit = async () => {
            if (shouldSkipLoginRateLimit()) return;
            if (!(await checkRateLimit(emailKey, 10, 60_000))) {
              throw new Error("Too many login attempts. Please wait a minute and try again.");
            }
          };

          await connectDB();
          const user = await User.findOne({
            email: emailRegexCaseInsensitive(emailInput),
            isActive: true,
          }).populate("branch");
          if (!user) {
            await enforceLoginRateLimit();
            return null;
          }
          if (typeof user.password !== "string" || !user.password) {
            await enforceLoginRateLimit();
            return null;
          }
          const isValid = await bcrypt.compare(credentials.password as string, user.password);
          if (!isValid) {
            await enforceLoginRateLimit();
            return null;
          }

          await clearRateLimit(emailKey);
          const hrRoleRaw = (user as { hrRole?: string }).hrRole;
          const hrRole =
            hrRoleRaw === "admin" || hrRoleRaw === "employee" ? hrRoleRaw : "employee";

          const branchId = user.branch?._id?.toString() || user.branch?.toString() || null;
          const orgFields = await resolveOrgSubscriptionForUser({
            role: user.role,
            branchId,
          });
          const normalizedRoles = normalizeUserRolesShape({
            role: user.role,
            roles: (user as { roles?: unknown }).roles,
            activeRole: (user as { activeRole?: unknown }).activeRole,
          });
          const effectiveRole = normalizedRoles.activeRole || user.role;
          const permissions = await resolvePermissionsForDbUser(
            { role: user.role, roles: normalizedRoles.roles, permissions: (user as { permissions?: unknown }).permissions },
            {
            organizationId: orgFields.organizationId,
            }
          );

          const uDash = user as unknown as {
            dashboardWidgets?: unknown;
            dashboardWidgetOrder?: unknown;
          };
          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: effectiveRole,
            roles: normalizedRoles.roles,
            activeRole: effectiveRole,
            permissions,
            branch: branchId ?? "",
            branchName: user.branch?.name || "",
            hrRole,
            dashboardWidgets: dashboardWidgetsFromDoc(uDash.dashboardWidgets),
            dashboardWidgetOrder: dashboardOrderFromDoc(uDash.dashboardWidgetOrder),
            ...orgFields,
          };
        } catch (err) {
          if (err instanceof Error && err.message.includes("Too many login attempts")) {
            throw err;
          }
          console.error("[AUTH] authorize error:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.roles = (user as { roles?: string[] }).roles ?? [];
        token.activeRole = (user as { activeRole?: string }).activeRole ?? (user as { role?: string }).role;
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
        token.branch = (user as { branch?: string }).branch;
        token.branchName = (user as { branchName?: string }).branchName;
        const hr = (user as { hrRole?: string }).hrRole;
        token.hrRole = hr === "admin" || hr === "employee" ? hr : "employee";
        const uDash = user as { dashboardWidgets?: unknown; dashboardWidgetOrder?: unknown };
        token.dashboardWidgets = dashboardWidgetsFromDoc(uDash.dashboardWidgets);
        token.dashboardWidgetOrder = dashboardOrderFromDoc(uDash.dashboardWidgetOrder);
        token.permsRefreshedAt = Date.now();
        const u = user as unknown as OrgTokenFields & { branch?: string };
        applyOrgFieldsToToken(token as Record<string, unknown>, {
          organizationId: u.organizationId ?? null,
          organizationName: u.organizationName ?? null,
          orgSubscriptionStatus: u.orgSubscriptionStatus ?? null,
          orgTrialEndsAt: u.orgTrialEndsAt ?? null,
          orgPaidThrough: u.orgPaidThrough ?? null,
          orgAccessAllowed: u.orgAccessAllowed ?? false,
        });
        return token;
      }

      // Re-load permissions from DB so module changes (e.g. chat) apply without a new login.
      const userId = (token.sub as string) || (token.id as string);
      if (!userId) return token;

      const REFRESH_MS = 45_000;
      const last = (token.permsRefreshedAt as number) || 0;
      const shouldRefresh = trigger === "update" || Date.now() - last > REFRESH_MS;

      if (shouldRefresh) {
        try {
          await connectDB();
          const dbUser = await User.findById(userId)
            .select("permissions role roles activeRole branch dashboardWidgets dashboardWidgetOrder")
            .lean();
          const branchId = dbUser?.branch?.toString();
          const orgFields = await resolveOrgSubscriptionForUser({
            role: String(dbUser?.role ?? token.role ?? ""),
            branchId,
          });
          if (dbUser?.role) {
            const normalizedRoles = normalizeUserRolesShape({
              role: String(dbUser.role),
              roles: (dbUser as { roles?: unknown }).roles,
              activeRole: (dbUser as { activeRole?: unknown }).activeRole,
            });
            token.permissions = await resolvePermissionsForDbUser(
              {
                permissions: dbUser.permissions,
                role: String(dbUser.role),
                roles: normalizedRoles.roles,
              },
              { organizationId: orgFields.organizationId }
            );
            token.roles = normalizedRoles.roles;
            token.activeRole = normalizedRoles.activeRole || String(dbUser.role);
            token.role = token.activeRole;
          }
          applyOrgFieldsToToken(token as Record<string, unknown>, orgFields);
          token.dashboardWidgets = dashboardWidgetsFromDoc(
            (dbUser as { dashboardWidgets?: unknown })?.dashboardWidgets
          );
          token.dashboardWidgetOrder = dashboardOrderFromDoc(
            (dbUser as { dashboardWidgetOrder?: unknown })?.dashboardWidgetOrder
          );
          token.permsRefreshedAt = Date.now();
        } catch {
          /* keep existing token.permissions */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.activeRole = (token.activeRole as string) ?? (token.role as string);
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.branch = token.branch as string;
        session.user.branchName = token.branchName as string;
        const hr = token.hrRole as string | undefined;
        session.user.hrRole = hr === "admin" || hr === "employee" ? hr : "employee";
        session.user.organizationId = (token.organizationId as string | null) ?? null;
        session.user.organizationName = (token.organizationName as string | null) ?? null;
        session.user.orgSubscriptionStatus = (token.orgSubscriptionStatus as string | null) ?? null;
        session.user.orgTrialEndsAt = (token.orgTrialEndsAt as number | null) ?? null;
        session.user.orgPaidThrough = (token.orgPaidThrough as number | null) ?? null;
        session.user.orgAccessAllowed = Boolean(token.orgAccessAllowed);
        session.user.dashboardWidgets = token.dashboardWidgets;
        session.user.dashboardWidgetOrder = token.dashboardWidgetOrder;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  // NextAuth attaches Expires / Max-Age to the session cookie; GET/POST wrappers below strip them so the cookie is browser-session-only (cleared when the user quits the browser — not when closing a single tab).
  secret: process.env.NEXTAUTH_SECRET,
};

/** NextAuth may set Max-Age/Expires on the JWT cookie. Strip them so the cookie is session-only (cleared when the browser closes). */
function isNextAuthSessionCookieName(cookieName: string): boolean {
  const n = cookieName.trim();
  return (
    n === "next-auth.session-token" ||
    n.startsWith("next-auth.session-token.") ||
    n === "__Secure-next-auth.session-token" ||
    n.startsWith("__Secure-next-auth.session-token.") ||
    n === "authjs.session-token" ||
    n.startsWith("authjs.session-token.")
  );
}

function sessionCookieValueLooksSet(setCookieHeader: string): boolean {
  const eq = setCookieHeader.indexOf("=");
  if (eq < 0) return false;
  const rest = setCookieHeader.slice(eq + 1);
  const semi = rest.indexOf(";");
  const value = (semi === -1 ? rest : rest.slice(0, semi)).trim();
  return value.length > 0;
}

function stripPersistentAttrsFromSetCookie(setCookieHeader: string): string {
  return setCookieHeader
    .replace(/;\s*Expires=[^;]*/gi, "")
    .replace(/;\s*Max-Age=\s*\d+/gi, "")
    .replace(/;\s*max-age=\s*\d+/gi, "");
}

function getSetCookieList(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function withBrowserSessionCookies(res: Response): Response {
  const list = getSetCookieList(res.headers);
  if (list.length === 0) return res;

  const out = new Headers(res.headers);
  out.delete("set-cookie");

  for (const line of list) {
    const name = line.split("=", 1)[0]?.trim() ?? "";
    const useSessionOnly =
      isNextAuthSessionCookieName(name) && sessionCookieValueLooksSet(line);
    const next = useSessionOnly ? stripPersistentAttrsFromSetCookie(line) : line;
    out.append("Set-Cookie", next);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

type NextAuthRouteCtx = { params: Promise<{ nextauth: string[] }> };

const nextAuthHandler = NextAuth(authOptions);

export async function GET(req: NextRequest, ctx: NextAuthRouteCtx) {
  const res = await nextAuthHandler(req, ctx);
  return withBrowserSessionCookies(res);
}

export async function POST(req: NextRequest, ctx: NextAuthRouteCtx) {
  const res = await nextAuthHandler(req, ctx);
  return withBrowserSessionCookies(res);
}

// Server-side session helper - use this in API routes
export async function auth() {
  return await getServerSession(authOptions);
}
