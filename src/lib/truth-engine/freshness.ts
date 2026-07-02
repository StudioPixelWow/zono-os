// ============================================================================
// 🛡️ Truth Engine — Freshness Engine (pure). 27.7. Part 5.
// REUSES the continuous-learning freshness scorer (no duplicated logic) and maps
// it to a categorical level: fresh / recent / stale / expired / unknown.
// ============================================================================
import { freshnessScore, daysSince } from "../brokerage-data/continuous-learning/freshness";
import type { FreshnessLevel } from "./types";

export { freshnessScore, daysSince };

/** Categorical freshness from the most recent evidence timestamp. */
export function freshnessLevel(lastIso: string | null, now: number = Date.now()): FreshnessLevel {
  if (!lastIso) return "unknown";
  const ms = new Date(lastIso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const days = (now - ms) / 86400000;
  if (days < 0) return "unknown";
  if (days <= 14) return "fresh";
  if (days <= 30) return "recent";
  if (days <= 90) return "stale";
  return "expired";
}

export function freshnessText(level: FreshnessLevel, lastIso: string | null): string {
  const d = daysSince(lastIso);
  const age = d == null ? "אין חותמת זמן לראיה" : `לפני ${Math.round(d)} ימים`;
  const label: Record<FreshnessLevel, string> = {
    fresh: "טרי", recent: "עדכני", stale: "מתיישן", expired: "פג תוקף", unknown: "לא ידוע",
  };
  return `${label[level]} (${age})`;
}
