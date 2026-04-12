import mongoose from "mongoose";
import type { Session } from "next-auth";
import Branch from "@/models/Branch";
import User from "@/models/User";

/**
 * Which AppSettings row (`organization` ref) applies to this session.
 * Prefer `session.user.organizationId`; if missing, derive from `branch` so staff
 * use the same tenant row as org admins. Branch may be missing on the JWT — fall back
 * to the user's record in the database (common after role/branch changes without re-login).
 */
export async function resolveAppSettingsOrganizationId(
  session: Session | null,
): Promise<mongoose.Types.ObjectId | null> {
  if (!session?.user) return null;

  const oid = session.user.organizationId;
  if (oid && mongoose.Types.ObjectId.isValid(oid)) {
    return new mongoose.Types.ObjectId(oid);
  }

  let branchId = session.user.branch ? String(session.user.branch).trim() : "";
  if (
    (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) &&
    session.user.id &&
    mongoose.Types.ObjectId.isValid(session.user.id)
  ) {
    const u = await User.findById(session.user.id).select("branch").lean();
    const b = u?.branch;
    branchId = b ? String(b).trim() : "";
  }

  if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
    return null;
  }

  const branch = await Branch.findById(branchId).select("organization").lean();
  if (!branch) return null;

  if (branch.organization) {
    return new mongoose.Types.ObjectId(String(branch.organization));
  }

  const { ensureBranchLinkedToOrganization } = await import("@/lib/ensureBranchOrganization");
  const org = await ensureBranchLinkedToOrganization(String(branchId));
  return org?._id ? (org._id as mongoose.Types.ObjectId) : null;
}
