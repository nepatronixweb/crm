/** Currency symbol shown next to commission % (by destination country). */
export const COUNTRY_CURRENCY_SYMBOL: Record<string, string> = {
  "United States": "$",
  "United Kingdom": "£",
  Canada: "CA$",
  Australia: "A$",
  "New Zealand": "NZ$",
  Germany: "€",
  France: "€",
  Japan: "¥",
  "South Korea": "₩",
  Netherlands: "€",
  Sweden: "kr",
  Denmark: "kr",
  Finland: "€",
  Norway: "kr",
  Switzerland: "CHF",
  Austria: "€",
  Ireland: "€",
  Singapore: "S$",
  Malaysia: "RM",
  "Dubai (UAE)": "AED",
  Cyprus: "€",
  Malta: "€",
  Hungary: "Ft",
  Poland: "zł",
  "Czech Republic": "Kč",
};

export const DEFAULT_COMMISSION_PERCENT = 10;

export function getCurrencySymbolForCountry(country: string): string {
  if (!country) return "";
  return COUNTRY_CURRENCY_SYMBOL[country] ?? "";
}

/** Resolve % from AppSettings map (country name -> percent) or default. */
export function resolveCommissionPercent(
  country: string,
  overrides?: Record<string, number> | null
): number {
  if (!country) return DEFAULT_COMMISSION_PERCENT;
  const v = overrides?.[country];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return DEFAULT_COMMISSION_PERCENT;
}
