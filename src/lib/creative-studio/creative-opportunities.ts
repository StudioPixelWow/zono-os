// ============================================================================
// ZONO — Creative Studio: REAL deterministic creative-opportunity engine (pure,
// client-safe, no I/O). Given active properties + their existing quick-creative
// outputs (both already fetched, org-scoped), derive evidence-backed reasons a
// property needs a creative. NO LLM, NO fabrication — every opportunity is a
// provable fact over real rows. The server selector fetches; this module only
// reasons; the UI only translates the structured reason to Hebrew.
//
// Signals (all provable from real tables):
//   NO_CREATIVE    — active property with zero (non-deleted) creatives
//   STALE_CREATIVE — active property whose newest creative is older than N days
//   MISSING_STORY  — active property with creatives but none in story_9_16 format
// Price-changed-after-creative is NOT included: there is no reliable price-history
// signal in the current schema (→ DATA_REQUIRED), so we never assert it.
// ============================================================================

export type CreativeOpportunityType = "NO_CREATIVE" | "STALE_CREATIVE" | "MISSING_STORY";

export interface OpportunityProperty {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  image: string | null;
  status: string;
}
export interface OpportunityOutput {
  propertyId: string;
  format: string | null;
  createdAtMs: number; // parsed created_at
}

export interface CreativeOpportunity {
  type: CreativeOpportunityType;
  propertyId: string;
  propertyTitle: string;
  location: string | null;
  image: string | null;
  priority: number;                 // higher = more urgent
  evidence: Record<string, number | string | boolean>;
  reasonHe: string;                 // UI-ready, derived from evidence (not free text)
  studioHref: string;               // opens the correct entity studio
}

const STORY_FORMAT = "story_9_16";
export const DEFAULT_STALE_DAYS = 30;

// One urgency ordering (active listing with nothing > aged > missing a format).
const PRIORITY: Record<CreativeOpportunityType, number> = { NO_CREATIVE: 100, STALE_CREATIVE: 70, MISSING_STORY: 45 };

const loc = (p: OpportunityProperty): string | null => [p.neighborhood, p.city].filter(Boolean).join(", ") || null;

/**
 * Derive at most one opportunity per property (the most urgent), across all
 * active properties. Deterministic; caller bounds the list. `nowMs`/`staleDays`
 * are injected so the function stays pure and testable.
 */
export function deriveCreativeOpportunities(input: {
  properties: OpportunityProperty[];
  outputs: OpportunityOutput[];
  nowMs: number;
  staleDays?: number;
}): CreativeOpportunity[] {
  const staleDays = input.staleDays ?? DEFAULT_STALE_DAYS;
  const staleMs = staleDays * 86_400_000;

  const byProp = new Map<string, OpportunityOutput[]>();
  for (const o of input.outputs) {
    if (!o.propertyId) continue;
    const arr = byProp.get(o.propertyId) ?? [];
    arr.push(o);
    byProp.set(o.propertyId, arr);
  }

  const out: CreativeOpportunity[] = [];
  for (const p of input.properties) {
    const href = `/creative-studio/property/${p.id}`;
    const title = p.title || loc(p) || "נכס";
    const base = { propertyId: p.id, propertyTitle: title, location: loc(p), image: p.image, studioHref: href };
    const rows = byProp.get(p.id) ?? [];

    if (rows.length === 0) {
      out.push({ ...base, type: "NO_CREATIVE", priority: PRIORITY.NO_CREATIVE, evidence: { creatives: 0 }, reasonHe: "אין עדיין קריאייטיב לנכס הזה" });
      continue;
    }
    const newestMs = Math.max(...rows.map((r) => r.createdAtMs));
    const ageDays = Math.floor((input.nowMs - newestMs) / 86_400_000);
    if (input.nowMs - newestMs > staleMs) {
      out.push({ ...base, type: "STALE_CREATIVE", priority: PRIORITY.STALE_CREATIVE, evidence: { ageDays, creatives: rows.length }, reasonHe: `הקריאייטיב האחרון של הנכס נוצר לפני ${ageDays} ימים` });
      continue;
    }
    const hasStory = rows.some((r) => r.format === STORY_FORMAT);
    if (!hasStory) {
      out.push({ ...base, type: "MISSING_STORY", priority: PRIORITY.MISSING_STORY, evidence: { creatives: rows.length, hasStory: false }, reasonHe: "אין גרסת סטורי (9:16) לנכס הזה" });
      continue;
    }
    // Property is well-covered → no opportunity (never a fabricated one).
  }

  return out.sort((a, b) => b.priority - a.priority || a.propertyTitle.localeCompare(b.propertyTitle, "he"));
}
