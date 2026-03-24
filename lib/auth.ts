import NextAuth, { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/utils";
import { UserRole } from "@/types";
import { checkRateLimit } from "@/lib/rateLimit";
import "@/models/Branch"; // register Branch schema for populate

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
          // Rate-limit: max 10 login attempts per email address per minute
          if (!checkRateLimit(`login:${credentials.email.toLowerCase()}`, 10, 60_000)) {
            throw new Error("Too many login attempts. Please wait a minute and try again.");
          }
          await connectDB();
          const user = await User.findOne({ email: credentials.email, isActive: true }).populate("branch");
          if (!user) return null;
          const isValid = await bcrypt.compare(credentials.password as string, user.password);
          if (!isValid) return null;
          const storedPerms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
          // Fall back to role defaults for users created before the permissions system
          const permissions: string[] =
            storedPerms.length > 0
              ? storedPerms
              : (ROLE_DEFAULT_PERMISSIONS[user.role as UserRole] ?? []) as string[];
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
