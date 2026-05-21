import mongoose from "mongoose";
import type { Session } from "next-auth";
import Lead from "@/models/Lead";
import Student from "@/models/Student";
import Enquiry from "@/models/Enquiry";
import User from "@/models/User";
import StudentDocument from "@/models/Document";
import Application from "@/models/Application";
import Commission from "@/models/Commission";
import {
  tenantBranchScopeForSession,
  isBranchInOrganization,
  isUserInOrganization,
  TENANT_SCOPE_EMPTY_MATCH,
} from "@/lib/orgUserScope";

/** Pure list filter for commission queries — strict organization match for tenants. */
export function tenantCommissionMongoFilter(params: {
  isSuperAdmin: boolean;
  organizationId: mongoose.Types.ObjectId | null;
}): Record<string, unknown> {
  if (params.isSuperAdmin) return {};
  if (!params.organizationId) return { ...TENANT_SCOPE_EMPTY_MATCH };
  return { organization: params.organizationId };
}

/** Mongo filter: tenant users only see commissions owned by their organization. */
export async function tenantCommissionScopeForSession(
  session: Session
): Promise<Record<string, unknown>> {
  return tenantCommissionMongoFilter({
    isSuperAdmin: session.user.role === "super_admin",
    organizationId: organizationIdForSessionCreate(session),
  });
}

/**
 * Stamp `organization` on legacy rows created by this tenant's non-platform users.
 * Platform `super_admin` rows stay org-less and remain super_admin-only.
 */
export async function backfillTenantCommissionOrganizations(session: Session): Promise<void> {
  if (session.user.role === "super_admin") return;
  const orgId = organizationIdForSessionCreate(session);
  if (!orgId) return;

  const orgUserIds = await getOrgUserIdsForSession(session);
  if (!orgUserIds?.length) return;

  const tenantCreators = (await User.find({
    _id: { $in: orgUserIds },
    role: { $ne: "super_admin" },
  })
    .distinct("_id")
    .exec()) as mongoose.Types.ObjectId[];

  if (!tenantCreators.length) return;

  await Commission.updateMany(
    {
      $or: [{ organization: null }, { organization: { $exists: false } }],
      createdBy: { $in: tenantCreators },
    },
    { $set: { organization: orgId } }
  );
}

export async function findCommissionInTenant(session: Session, id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const doc = await Commission.findById(id).exec();
  if (!doc) return null;
  if (session.user.role === "super_admin") return doc;

  const orgId = organizationIdForSessionCreate(session);
  if (!orgId) return null;

  if (doc.organization) {
    return doc.organization.toString() === orgId.toString() ? doc : null;
  }

  const creator = await User.findById(doc.createdBy).select("role branch").lean();
  if (!creator || creator.role === "super_admin") return null;

  const orgUserIds = await getOrgUserIdsForSession(session);
  if (!orgUserIds?.some((uid) => uid.toString() === String(doc.createdBy))) return null;
  return doc;
}

/** User list filter for the current tenant (User.branch). */
export async function tenantUserScopeForSession(
  session: Session
): Promise<Record<string, unknown>> {
  return tenantBranchScopeForSession(session);
}

/** Distinct user ids in the tenant; `null` = super_admin (no restriction). */
export async function getOrgUserIdsForSession(
  session: Session
): Promise<mongoose.Types.ObjectId[] | null> {
  if (session.user.role === "super_admin") return null;
  const scope = await tenantBranchScopeForSession(session);
  if ("_id" in scope) return [];
  const ids = await User.find(scope).distinct("_id");
  return ids as mongoose.Types.ObjectId[];
}

/** Distinct student ids in the tenant; `null` = super_admin (no restriction). */
export async function getTenantStudentIdsForSession(
  session: Session
): Promise<mongoose.Types.ObjectId[] | null> {
  if (session.user.role === "super_admin") return null;
  const scope = await tenantBranchScopeForSession(session);
  if ("_id" in scope) return [];
  const ids = await Student.find(scope).distinct("_id");
  return ids as mongoose.Types.ObjectId[];
}

/** Mongo filter on optional `organization` field (inventory, etc.). */
export function tenantOrganizationScopeForSession(
  session: Session
): Record<string, unknown> {
  if (session.user.role === "super_admin") return {};
  const orgId = session.user.organizationId;
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    return { organization: new mongoose.Types.ObjectId(orgId) };
  }
  return { ...TENANT_SCOPE_EMPTY_MATCH };
}

/** Resolve optional ?branch= against tenant — rejects foreign branch ids. */
export async function resolveBranchQueryForSession(
  session: Session,
  branchParam: string | null | undefined
): Promise<Record<string, unknown>> {
  const branch = branchParam?.trim() || "";
  if (session.user.role === "super_admin") {
    return branch ? { branch } : {};
  }
  if (!branch) return tenantBranchScopeForSession(session);
  const orgId = session.user.organizationId;
  if (orgId && (await isBranchInOrganization(branch, orgId))) {
    return { branch: new mongoose.Types.ObjectId(branch) };
  }
  return { ...TENANT_SCOPE_EMPTY_MATCH };
}

export async function findLeadInTenant(session: Session, id: string) {
  if (session.user.role === "super_admin") {
    return Lead.findById(id).exec();
  }
  const scope = await tenantBranchScopeForSession(session);
  return Lead.findOne({ _id: id, ...scope }).exec();
}

export async function findStudentInTenant(session: Session, id: string) {
  if (session.user.role === "super_admin") {
    return Student.findById(id).exec();
  }
  const scope = await tenantBranchScopeForSession(session);
  return Student.findOne({ _id: id, ...scope }).exec();
}

export async function findEnquiryInTenant(session: Session, id: string) {
  if (session.user.role === "super_admin") {
    return Enquiry.findById(id).exec();
  }
  const scope = await tenantBranchScopeForSession(session);
  return Enquiry.findOne({ _id: id, ...scope }).exec();
}

export async function assertUserInTenant(
  session: Session,
  userId: string
): Promise<boolean> {
  if (session.user.role === "super_admin") return true;
  const orgId = session.user.organizationId;
  if (!orgId) return false;
  return isUserInOrganization(userId, orgId);
}

export async function assertAllUsersInTenant(
  session: Session,
  userIds: string[]
): Promise<boolean> {
  for (const id of userIds) {
    if (!(await assertUserInTenant(session, id))) return false;
  }
  return true;
}

/** ObjectId to stamp on new tenant-owned rows (inventory); null for super_admin platform rows. */
export function organizationIdForSessionCreate(
  session: Session
): mongoose.Types.ObjectId | null {
  if (session.user.role === "super_admin") return null;
  const orgId = session.user.organizationId;
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    return new mongoose.Types.ObjectId(orgId);
  }
  return null;
}

/** Resolve org id string for stamping new rows. */
export function organizationIdStringForSession(session: Session): string | null {
  const oid = organizationIdForSessionCreate(session);
  return oid ? oid.toString() : null;
}

type ParentRefs = {
  studentId?: string | null;
  leadId?: string | null;
  enquiryId?: string | null;
};

/** Verify lead/student/enquiry belongs to the current tenant. */
export async function assertParentRecordsInTenant(
  session: Session,
  refs: ParentRefs
): Promise<boolean> {
  if (session.user.role === "super_admin") return true;
  if (refs.studentId) return !!(await findStudentInTenant(session, refs.studentId));
  if (refs.leadId) return !!(await findLeadInTenant(session, refs.leadId));
  if (refs.enquiryId) return !!(await findEnquiryInTenant(session, refs.enquiryId));
  return false;
}

export async function findApplicationInTenant(session: Session, id: string) {
  const app = await Application.findById(id).exec();
  if (!app || session.user.role === "super_admin") return app;
  if (!app.student) return null;
  const student = await findStudentInTenant(session, String(app.student));
  return student ? app : null;
}

export async function findDocumentInTenant(session: Session, id: string) {
  const doc = await StudentDocument.findById(id).exec();
  if (!doc) return null;
  if (session.user.role === "super_admin") return doc;
  const ok = await assertParentRecordsInTenant(session, {
    studentId: doc.student ? String(doc.student) : null,
    leadId: doc.lead ? String(doc.lead) : null,
    enquiryId: doc.enquiry ? String(doc.enquiry) : null,
  });
  return ok ? doc : null;
}

/** Enquiry in tenant + role-based access (org_admin sees all in org). */
export async function getEnquiryForSessionAccess(session: Session, id: string) {
  const enquiry =
    session.user.role === "super_admin"
      ? await Enquiry.findById(id).exec()
      : await findEnquiryInTenant(session, id);
  if (!enquiry) return "not_found";

  const role = session.user.role;
  if (role === "super_admin" || role === "org_admin" || role === "telecaller") {
    return enquiry;
  }
  if (role === "counsellor") {
    const assigned = enquiry.assignedTo ? String(enquiry.assignedTo) : "";
    return assigned === session.user.id ? enquiry : "forbidden";
  }
  return "forbidden";
}

/** Filter documents list to tenant-owned parent records only. */
export async function appendDocumentListTenantScope(
  session: Session,
  filter: Record<string, unknown>
): Promise<void> {
  if (session.user.role === "super_admin") return;
  const scope = await tenantBranchScopeForSession(session);
  if ("_id" in scope) {
    filter._id = { $exists: false };
    return;
  }
  const [studentIds, leadIds, enquiryIds] = await Promise.all([
    Student.find(scope).distinct("_id"),
    Lead.find(scope).distinct("_id"),
    Enquiry.find(scope).distinct("_id"),
  ]);
  filter.$or = [
    { student: { $in: studentIds } },
    { lead: { $in: leadIds } },
    { enquiry: { $in: enquiryIds } },
  ];
}
