// ============================================================================
// ZONO — usage analytics shaping (pure). Tracks product usage (feature, screen,
// workflow, automation, ai, performance, error) WITHOUT business content. A
// strict allow-list of prop value types + key denylist guards against leaking
// names, addresses, prices, phone numbers, or any PII into analytics.
// ============================================================================
import type { UsageCategory, UsageEventInput } from "./types";

export const USAGE_CATEGORIES: UsageCategory[] = ["feature", "screen", "workflow", "automation", "ai", "performance", "error"];

// Prop keys that must never be recorded (defence in depth). Analytics is for
// counts/labels/durations only — never identifiers or business content.
const SENSITIVE_KEY = /(name|email|phone|address|price|budget|owner|client|seller|buyer|note|message|body|content|title|token|secret)/i;

export interface SanitizedUsageEvent {
  category: UsageCategory;
  name: string;
  props: Record<string, string | number | boolean>;
  dropped: string[];   // prop keys that were rejected
}

/** Sanitize an event: keep only allow-listed primitive props with safe keys. */
export function sanitizeUsageEvent(input: UsageEventInput): SanitizedUsageEvent | null {
  if (!USAGE_CATEGORIES.includes(input.category)) return null;
  const name = String(input.name || "").slice(0, 120).trim();
  if (!name) return null;

  const props: Record<string, string | number | boolean> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(input.props ?? {})) {
    if (SENSITIVE_KEY.test(k)) { dropped.push(k); continue; }
    if (typeof v === "number" && Number.isFinite(v)) { props[k] = v; continue; }
    if (typeof v === "boolean") { props[k] = v; continue; }
    if (typeof v === "string") {
      // Strings are heavily constrained: short, no digits-heavy values (avoid ids/prices/phones).
      const s = v.slice(0, 40);
      if (/^\+?\d[\d\s-]{5,}$/.test(s)) { dropped.push(k); continue; } // phone-like
      props[k] = s;
      continue;
    }
    dropped.push(k);
  }
  return { category: input.category, name, props, dropped };
}

/** Aggregate a list of events into per-name counts (for the analytics view). */
export function aggregateByName(events: { name: string }[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
