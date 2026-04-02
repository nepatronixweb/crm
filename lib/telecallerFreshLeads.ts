/**
 * Telecaller dashboard "Fresh leads" — new & pending contact only.
 * Keep in sync with GET /api/leads?bucket=telecaller_fresh
 */
export const TELECALLER_FRESH_BUCKET = "telecaller_fresh";
const FRESH_STATUSES = ["Open/Unassigned", "Interested", "AP-Interested", "FD-Interested"] as const;

export function isTelecallerFreshLead(l: { status?: string; standing?: string }): boolean {
  const s = (l.status ?? "").trim();
  if (l.standing === "cold" || l.standing === "out_of_contact") return false;
  if (
    ["AP-Not Interested", "Not Interested", "Not Qualified", "Dead/Junk Lead", "FD-Junk", "Closed Lost"].includes(s)
  ) {
    return false;
  }
  if (
    ["Assigned", "Counselling", "Counselled", "Qualified Lead", "Phone Counselling", "Registered/Completed"].includes(s)
  ) {
    return false;
  }
  if (["AP-Call Not Received", "Not Answering", "AP-Call Back Later"].includes(s)) return false;
  if (["In-Progress", "AP-Pending"].includes(s)) return false;
  if (FRESH_STATUSES.includes(s as (typeof FRESH_STATUSES)[number])) return true;
  if (!s) return true;
  return false;
}

/** Apply MongoDB conditions for telecaller fresh bucket (mutates filter). */
export function mergeTelecallerFreshLeadFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: Record<string, any>,
  searchOrClause?: Array<Record<string, unknown>>
): void {
  delete filter.status;
  delete filter.standing;

  const standingQ = { standing: { $nin: ["cold", "out_of_contact"] } };
  const statusQ = {
    $or: [
      { status: { $in: [...FRESH_STATUSES] } },
      { status: "" },
      { status: null },
      { status: { $exists: false } },
    ],
  };

  if (searchOrClause?.length) {
    filter.$and = [standingQ, statusQ, { $or: searchOrClause }];
    if (filter.$or) delete filter.$or;
  } else {
    if (filter.$or) delete filter.$or;
    Object.assign(filter, standingQ);
    Object.assign(filter, statusQ);
  }
}
