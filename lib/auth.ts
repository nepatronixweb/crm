import NextAuth, { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import AppSettings from "@/models/AppSettings";
import { normalizeApplicationRoles, resolveDefaultPermissionsForSlug } from "@/lib/applicationRoles";
import { checkRateLimit, clearRateLimit } from "@/lib/rateLimit";
import "@/models/Branch"; // register Branch schema for populate

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
          const enforceLoginRateLimit = () => {
            if (shouldSkipLoginRateLimit()) return;
            if (!checkRateLimit(emailKey, 10, 60_000)) {
              throw new Error("Too many login attempts. Please wait a minute and try again.");
            }
          };

          await connectDB();
          const user = await User.findOne({
            email: emailRegexCaseInsensitive(emailInput),
            isActive: true,
          }).populate("branch");
          if (!user) {
            enforceLoginRateLimit();
            return null;
          }
          if (typeof user.password !== "string" || !user.password) {
            enforceLoginRateLimit();
            return null;
          }
          const isValid = await bcrypt.compare(credentials.password as string, user.password);
          if (!isValid) {
            enforceLoginRateLimit();
            return null;
          }

          clearRateLimit(emailKey);
          const storedPerms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
          const settingsRow = await AppSettings.findOne().lean();
          const roleCatalog = normalizeApplicationRoles(settingsRow?.applicationRoles);
          const permissions: string[] =
            storedPerms.length > 0
              ? storedPerms
              : resolveDefaultPermissionsForSlug(user.role, roleCatalog);
          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            permissions,
            branch: user.branch?._id?.toString() || user.branch?.toString(),
            branchName: user.branch?.name || "",
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
        token.branch = (user as { branch?: string }).branch;
        token.branchName = (user as { branchName?: string }).branchName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.branch = token.branch as string;
        session.user.branchName = token.branchName as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

// Named exports for the [...nextauth] route
export { handler as GET, handler as POST };

// Server-side session helper — use this in API routes
export async function auth() {
  return await getServerSession(authOptions);
}
