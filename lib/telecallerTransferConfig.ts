import type { TelecallerTransferOutcome } from "@/types/telecallerTransfer";

export type { TelecallerTransferOutcome } from "@/types/telecallerTransfer";

export const DEFAULT_TELECALLER_TRANSFER_OUTCOMES: TelecallerTransferOutcome[] = [
  {
    id: "lead_transferred",
    label: "Lead transferred",
    effect: "assign_counsellor",
    fdStatus: "Assigned",
    requiresCounsellor: true,
    requiresAppointmentDate: false,
  },
  {
    id: "appointment",
    label: "Appointment",
    effect: "set_status",
    fdStatus: "Counselling",
    requiresCounsellor: false,
    requiresAppointmentDate: true,
  },
  {
    id: "phone_counselling",
    label: "Phone counselling",
    effect: "set_status",
    fdStatus: "Phone Counselling",
    requiresCounsellor: false,
    requiresAppointmentDate: false,
  },
  {
    id: "online_enrollment",
    label: "Online enrollment",
    effect: "set_status",
    fdStatus: "Registered/Completed",
    requiresCounsellor: false,
    requiresAppointmentDate: false,
  },
  {
    id: "cold",
    label: "Cold",
    effect: "set_standing",
    standing: "cold",
    requiresCounsellor: false,
    requiresAppointmentDate: false,
  },
  {
    id: "cnr_engaged",
    label: "CNR / Engaged",
    effect: "set_status",
    fdStatus: "AP-Call Not Received",
    requiresCounsellor: false,
    requiresAppointmentDate: false,
  },
];

const EFFECTS = new Set(["assign_counsellor", "set_status", "set_standing"]);

export function normalizeTelecallerTransferOutcomes(raw: unknown): TelecallerTransferOutcome[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TELECALLER_TRANSFER_OUTCOMES;
  const out: TelecallerTransferOutcome[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const label = String(r.label ?? "").trim();
    const effect = String(r.effect ?? "").trim();
    if (!id || !label || !EFFECTS.has(effect)) continue;
    const o: TelecallerTransferOutcome = {
      id,
      label,
      effect: effect as TelecallerTransferOutcome["effect"],
      fdStatus: r.fdStatus != null ? String(r.fdStatus) : undefined,
      standing: r.standing != null ? String(r.standing) : undefined,
      requiresCounsellor: Boolean(r.requiresCounsellor),
      requiresAppointmentDate: Boolean(r.requiresAppointmentDate),
    };
    if (o.effect === "assign_counsellor" && !o.fdStatus) o.fdStatus = "Assigned";
    if (o.effect === "set_status" && !o.fdStatus) continue;
    if (o.effect === "set_standing" && !o.standing) continue;
    out.push(o);
  }
  return out.length > 0 ? out : DEFAULT_TELECALLER_TRANSFER_OUTCOMES;
}

export function buildTelecallerTransferPatchFromOutcome(
  outcome: TelecallerTransferOutcome,
  opts: { counsellorId?: string; assignedBy?: string; appointmentDate?: string }
): Record<string, unknown> {
  switch (outcome.effect) {
    case "assign_counsellor":
      return {
        status: outcome.fdStatus || "Assigned",
        assignedTo: opts.counsellorId,
        assignedBy: opts.assignedBy,
      };
    case "set_status": {
      const patch: Record<string, unknown> = { status: outcome.fdStatus };
      if (outcome.requiresAppointmentDate && opts.appointmentDate?.trim()) {
        patch.statusDate = opts.appointmentDate.trim();
      }
      return patch;
    }
    case "set_standing":
      return { standing: outcome.standing };
    default:
      return {};
  }
}
