// ============================================================================
// ZONO Brokerage Evolution — Growth analytics + Prediction + Change detection.
// Pure & deterministic. Predictions carry confidence + evidence + explanation
// and are NEVER presented as fact.
// ============================================================================
import type { GrowthRow, PredictionResult, EvolutionEvent } from "./types";

export function growthPct(prev: number, curr: number): number {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

/** Rank entities by growth delta. Returns { rising, declining } leaderboards. */
export function buildLeaders(rows: Omit<GrowthRow, "deltaPct">[]): { rising: GrowthRow[]; declining: GrowthRow[] } {
  const withDelta = rows.map((r) => ({ ...r, deltaPct: growthPct(r.prev, r.curr) }));
  const rising = withDelta.filter((r) => r.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 15);
  const declining = withDelta.filter((r) => r.deltaPct < 0).sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 15);
  return { rising, declining };
}

/** Linear regression slope + R² over a numeric series (time-ordered). */
function regression(series: number[]): { slope: number; r2: number } {
  const n = series.length;
  if (n < 2) return { slope: 0, r2: 0 };
  const xs = series.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, denx = 0, deny = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = series[i] - my; num += dx * dy; denx += dx * dx; deny += dy * dy; }
  const slope = denx ? num / denx : 0;
  const r2 = denx && deny ? Math.pow(num, 2) / (denx * deny) : 0;
  return { slope, r2: Math.max(0, Math.min(1, r2)) };
}

/**
 * Predict a trend from a historical series. likelihood/confidence reflect slope
 * strength and fit (R²) and the amount of history. Honest: short/noisy series →
 * low confidence. Never a fact.
 */
export function predictTrend(series: number[], metricLabel = "פעילות"): PredictionResult {
  const { slope, r2 } = regression(series);
  const last = series[series.length - 1] ?? 0;
  const avg = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
  const relSlope = avg > 0 ? slope / avg : slope;
  const likelihood = Math.round(Math.max(0, Math.min(100, 50 + relSlope * 120)));
  // confidence: more points + better fit → higher; capped low for short history.
  const lengthFactor = Math.min(1, (series.length - 1) / 6);
  const confidence = Math.round(Math.max(15, Math.min(90, (40 + r2 * 45) * lengthFactor + 15)));
  const dir = slope > 0.05 * Math.max(1, avg) ? "עלייה" : slope < -0.05 * Math.max(1, avg) ? "ירידה" : "יציבות";
  const evidence = [`מגמת ${metricLabel}: ${dir}`, `${series.length} נקודות מדידה`, `התאמה (R²) ${(r2 * 100).toFixed(0)}%`, `ערך אחרון ${last}`];
  const explanation = `על בסיס ${series.length} מדידות היסטוריות, מגמת ה${metricLabel} מצביעה על ${dir}. הערכה בלבד — לא ודאות.`;
  return { likelihood, confidence, slope, evidence, explanation };
}

// ── Change detection (diff → evolution events) ──────────────────────────────
const FIELD_EVENT: Record<string, { added: string; changed: string; label: string }> = {
  owner_name:     { added: "owner_changed", changed: "owner_changed", label: "בעלים" },
  brand_network:  { added: "brand_change", changed: "brand_change", label: "מותג" },
  name:           { added: "created", changed: "name_changed" as string, label: "שם" },
  primary_phone:  { added: "phone_added", changed: "phone_changed" as string, label: "טלפון" },
  primary_email:  { added: "email_added" as string, changed: "email_changed" as string, label: "אימייל" },
  website_url:    { added: "website_updated", changed: "website_updated", label: "אתר" },
  city:           { added: "entered_city", changed: "entered_city", label: "עיר" },
  office_id:      { added: "office_changed", changed: "office_changed", label: "שיוך משרד" },
};

/** Detect field-level evolution events by diffing previous vs current values. */
export function detectFieldChanges(prev: Record<string, string | null>, curr: Record<string, string | null>): EvolutionEvent[] {
  const events: EvolutionEvent[] = [];
  for (const [field, cfg] of Object.entries(FIELD_EVENT)) {
    const a = (prev[field] ?? "").trim(), b = (curr[field] ?? "").trim();
    if (a === b) continue;
    const isAdd = !a && !!b;
    if (!b) continue; // we don't assert "removed" for public data (legal-safe)
    const eventType = isAdd ? cfg.added : cfg.changed;
    events.push({ eventType, title: isAdd ? `${cfg.label} נוסף` : `${cfg.label} עודכן`, detail: isAdd ? b : `${a} ← ${b}`, field, oldValue: a || null, newValue: b });
  }
  return events;
}

/** Growth events from a metric delta (listings/agents). */
export function detectGrowthEvents(prev: { listings: number; agents: number }, curr: { listings: number; agents: number }): EvolutionEvent[] {
  const events: EvolutionEvent[] = [];
  const lg = growthPct(prev.listings, curr.listings);
  if (Math.abs(lg) >= 25 && (prev.listings > 0 || curr.listings > 0)) events.push({ eventType: lg > 0 ? "listing_growth" : "listing_decline", title: lg > 0 ? "צמיחה במלאי" : "ירידה במלאי", detail: `${prev.listings} → ${curr.listings} (${lg > 0 ? "+" : ""}${lg}%)`, field: "listings", oldValue: String(prev.listings), newValue: String(curr.listings) });
  if (curr.agents > prev.agents) events.push({ eventType: "agent_growth", title: "גידול בסוכנים", detail: `${prev.agents} → ${curr.agents}`, field: "agents", oldValue: String(prev.agents), newValue: String(curr.agents) });
  return events;
}
