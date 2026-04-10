import type { Session } from "next-auth";
import { hasPermission } from "@/lib/utils";

/** True if the signed-in user may use internal chat (all active team accounts; see hasPermission for "chat"). */
export function userHasChatAccess(session: Session | null): boolean {
  if (!session?.user) return false;
  return hasPermission(
    (session.user.permissions ?? []) as string[],
    "chat",
    session.user.role,
  );
}
