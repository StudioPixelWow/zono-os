/**
 * Small, dependency-free utilities shared across ZONO.
 */

/**
 * Conditional className joiner (tiny clsx replacement).
 * Accepts strings, falsy values, or { className: boolean } maps.
 */
export function cn(
  ...inputs: Array<string | false | null | undefined | Record<string, boolean>>
): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      out.push(input);
    } else {
      for (const [key, active] of Object.entries(input)) {
        if (active) out.push(key);
      }
    }
  }
  return out.join(" ");
}

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/** Format whole shekels as "₪3,250,000". */
export function formatShekels(value: number): string {
  return ILS.format(value);
}

/** Compact shekels for tight UI, e.g. "₪3.25M" / "₪450K". */
export function formatShekelsCompact(value: number): string {
  if (value >= 1_000_000) return `₪${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `₪${Math.round(value / 1_000)}K`;
  return `₪${value}`;
}

const HE_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Format an ISO date as a Hebrew short date. */
export function formatDate(iso: string): string {
  return HE_DATE.format(new Date(iso));
}

/** Hebrew relative time, e.g. "לפני 3 ימים". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(days, "day");
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** True only for a canonical UUID. Guards against names/slugs reaching uuid columns. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}
