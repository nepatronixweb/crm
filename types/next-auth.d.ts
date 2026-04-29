import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      roles: string[];
      activeRole: string;
      branch: string;
      branchName: string;
      permissions: string[];
      /** HR module: "admin" | "employee" - separate from CRM role. */
      hrRole?: "admin" | "employee";
      /** Billable tenant (null for super_admin). */
      organizationId: string | null;
      organizationName: string | null;
      orgSubscriptionStatus: string | null;
      orgTrialEndsAt: number | null;
      orgPaidThrough: number | null;
      /** When false, middleware blocks app APIs and pages except /billing. */
      orgAccessAllowed: boolean;
      /** Per-user dashboard visibility overrides (merged with org settings). */
      dashboardWidgets?: Record<string, boolean>;
      dashboardWidgetOrder?: Partial<Record<string, string[]>>;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    hrRole?: "admin" | "employee";
    roles?: string[];
    activeRole?: string;
    organizationId?: string | null;
    organizationName?: string | null;
    orgSubscriptionStatus?: string | null;
    orgTrialEndsAt?: number | null;
    orgPaidThrough?: number | null;
    orgAccessAllowed?: boolean;
    dashboardWidgets?: Record<string, boolean>;
    dashboardWidgetOrder?: Partial<Record<string, string[]>>;
  }
}
