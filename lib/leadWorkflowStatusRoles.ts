/**
 * Who may change a lead's FD workflow `status` from the UI (leads table + lead detail).
 * API PATCH uses {@link LEAD_PATCH_FD_STATUS_AND_STAGE_ROLES} plus the front_desk-only branch.
 */
export const LEAD_TABLE_FD_STATUS_EDIT_ROLES = new Set([
  "super_admin",
  "org_admin",
  "front_desk",
  "counsellor",
  "telecaller",
  "application_team",
  "admission_team",
  "visa_team",
]);

/** May PATCH both `status` and `stage` on a lead (not front_desk — that branch is status-only). */
export const LEAD_PATCH_FD_STATUS_AND_STAGE_ROLES = new Set([
  "super_admin",
  "org_admin",
  "counsellor",
  "telecaller",
  "application_team",
  "admission_team",
  "visa_team",
]);

export function roleCanEditLeadFdStatus(role: string | undefined): boolean {
  return !!role && LEAD_TABLE_FD_STATUS_EDIT_ROLES.has(role);
}
