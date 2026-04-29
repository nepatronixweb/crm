/**
 * Telecaller dashboard "Lead overview" cards - keep filters in sync with
 * app/(dashboard)/dashboard/page.tsx (isTelecaller && assignedLeads counts).
 */
export const TELECALLER_OVERVIEW_TRANSFERRED = "telecaller_transferred";
export const TELECALLER_OVERVIEW_APPOINTMENT = "telecaller_appointment";
export const TELECALLER_OVERVIEW_PHONE_COUNSELLING = "telecaller_phone_counselling";
export const TELECALLER_OVERVIEW_ONLINE_ENROLLMENT = "telecaller_online_enrollment";
export const TELECALLER_OVERVIEW_COLD = "telecaller_cold";
export const TELECALLER_OVERVIEW_CNR = "telecaller_cnr";

export const TELECALLER_OVERVIEW_BUCKETS = [
  TELECALLER_OVERVIEW_TRANSFERRED,
  TELECALLER_OVERVIEW_APPOINTMENT,
  TELECALLER_OVERVIEW_PHONE_COUNSELLING,
  TELECALLER_OVERVIEW_ONLINE_ENROLLMENT,
  TELECALLER_OVERVIEW_COLD,
  TELECALLER_OVERVIEW_CNR,
] as const;

export type TelecallerOverviewBucket = (typeof TELECALLER_OVERVIEW_BUCKETS)[number];

export function isTelecallerOverviewDashboardBucket(bucket: string | null | undefined): bucket is TelecallerOverviewBucket {
  return !!bucket && (TELECALLER_OVERVIEW_BUCKETS as readonly string[]).includes(bucket);
}

/** Human-readable label for leads page banner / header. */
export const TELECALLER_OVERVIEW_BUCKET_LABEL: Record<TelecallerOverviewBucket, string> = {
  [TELECALLER_OVERVIEW_TRANSFERRED]: "Transferred (moved to counsellor)",
  [TELECALLER_OVERVIEW_APPOINTMENT]: "Appointment (counselling scheduled)",
  [TELECALLER_OVERVIEW_PHONE_COUNSELLING]: "Phone counselling",
  [TELECALLER_OVERVIEW_ONLINE_ENROLLMENT]: "Online enrollment",
  [TELECALLER_OVERVIEW_COLD]: "Cold",
  [TELECALLER_OVERVIEW_CNR]: "CNR / engaged",
};

const TRANSFERRED_STATUSES = ["Assigned", "Counselling", "Counselled", "Qualified Lead"];
const PHONE_COUNSELLING_STATUSES = ["Phone Counselling", "Online Counselling", "Counselled"];
const COLD_STATUSES = [
  "AP-Not Interested",
  "Not Interested",
  "Not Qualified",
  "Dead/Junk Lead",
  "FD-Junk",
  "Closed Lost",
];
const CNR_STATUSES = ["AP-Call Not Received", "Not Answering", "AP-Call Back Later"];

/**
 * Apply MongoDB conditions for a telecaller overview bucket (mutates filter).
 * Returns false if bucket is not a known overview bucket.
 */
export function mergeTelecallerOverviewBucketFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: Record<string, any>,
  bucket: string,
  searchOrClause?: Array<Record<string, unknown>>
): boolean {
  let bucketClause: Record<string, unknown>;
  switch (bucket) {
    case TELECALLER_OVERVIEW_TRANSFERRED:
      bucketClause = {
        $or: [
          { status: { $in: TRANSFERRED_STATUSES } },
          { assignedTo: { $exists: true, $ne: null } },
          { "statusDates.Assigned": { $exists: true } },
          { "statusDates.Counselling": { $exists: true } },
          { "statusDates.Counselled": { $exists: true } },
        ],
      };
      break;
    case TELECALLER_OVERVIEW_APPOINTMENT:
      bucketClause = {
        $or: [
          { status: "Counselling" },
          { "statusDates.Counselling": { $exists: true } },
        ],
      };
      break;
    case TELECALLER_OVERVIEW_PHONE_COUNSELLING:
      bucketClause = {
        $or: [
          { status: { $in: PHONE_COUNSELLING_STATUSES } },
          { "statusDates.Phone Counselling": { $exists: true } },
          { "statusDates.Counselled": { $exists: true } },
        ],
      };
      break;
    case TELECALLER_OVERVIEW_ONLINE_ENROLLMENT:
      bucketClause = {
        $or: [
          { status: { $in: ["Online Counselling", "Registered/Completed"] } },
          { "statusDates.Online Counselling": { $exists: true } },
          { "statusDates.Registered/Completed": { $exists: true } },
        ],
      };
      break;
    case TELECALLER_OVERVIEW_COLD:
      bucketClause = {
        $or: [{ standing: "cold" }, { status: { $in: COLD_STATUSES } }],
      };
      break;
    case TELECALLER_OVERVIEW_CNR:
      bucketClause = { status: { $in: CNR_STATUSES } };
      break;
    default:
      return false;
  }

  delete filter.status;
  delete filter.standing;

  if (searchOrClause?.length) {
    filter.$and = [bucketClause, { $or: searchOrClause }];
    delete filter.$or;
  } else {
    delete filter.$or;
    Object.assign(filter, bucketClause);
  }
  return true;
}
