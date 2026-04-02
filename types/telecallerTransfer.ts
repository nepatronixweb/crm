export type TelecallerTransferEffect = "assign_counsellor" | "set_status" | "set_standing";

export type TelecallerTransferOutcome = {
  id: string;
  label: string;
  effect: TelecallerTransferEffect;
  fdStatus?: string;
  standing?: string;
  requiresCounsellor?: boolean;
  requiresAppointmentDate?: boolean;
};
