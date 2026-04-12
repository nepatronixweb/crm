"use client";

/**
 * Lead workflow statuses from Settings (via {@link BrandingProvider} — one `/api/settings/app`
 * load for the whole app so every department sees the same list as admin).
 */
export { useFdWorkflowStatusOptions as useFdStatusOptions } from "@/app/branding-context";
export type { FdStatusOption } from "@/lib/fdStatusOptions";
