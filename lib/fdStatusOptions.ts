import { FD_STATUSES } from "@/lib/utils";

export type FdStatusOption = { value: string; label: string; color: string };

export function fdStatusOptionsFromStrings(list: string[]): FdStatusOption[] {
  return list.map((s) => {
    const existing = FD_STATUSES.find((f) => f.value === s);
    return existing || { value: s, label: s, color: "bg-gray-500 text-white" };
  });
}

/** Label + pill classes for dashboard/reports (pass options from the same source as leads UI). */
export function resolveFdStatusPresentation(
  options: FdStatusOption[],
  value: string | undefined | null,
): { label: string; colorClass: string } {
  if (value == null || value === "") {
    return { label: "", colorClass: "border border-gray-200 bg-white text-gray-600" };
  }
  const o = options.find((x) => x.value === value);
  if (o) return { label: o.label, colorClass: o.color };
  return { label: value, colorClass: "border border-gray-200 bg-white text-gray-600" };
}

/**
 * Admin-configured list for pickers. If the record still has a value removed from settings,
 * append it once so the user can see it and change away.
 */
export function fdWorkflowChoicesForPicker(
  fromSettings: FdStatusOption[],
  currentValue?: string | null,
): FdStatusOption[] {
  if (currentValue == null || currentValue === "") return fromSettings;
  if (fromSettings.some((o) => o.value === currentValue)) return fromSettings;
  return [
    ...fromSettings,
    { value: currentValue, label: `${currentValue} (legacy)`, color: "bg-gray-500 text-white" },
  ];
}
