// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Legacy → canonical stage maps (PURE).
//
// Input for the Batch 5.3 backfill. Every mapping below is evidence-based:
// the source vocabularies were read from the LIVE database, not assumed.
//
// LIVE EVIDENCE (zono-dev / tlrefajhyrqnjtmimaos, read 2026-07-11):
//   · ENUM journey_stage           = 8 values (property lifecycle)
//   · property_journeys            = 10 rows; distinct stages in use: new, active_marketing
//   · journey_stages (seed catalog)= 31 rows: buyer 16 keys, seller 15 keys
//   · journeys / journey_events    = 0 rows  → nothing to migrate on the spine
//   · deal_journeys                = 0 rows  → no legacy deal stages in use
//   · 17 other journey_* satellites= 0 rows
//
// Because `journeys` is empty, the buyer/seller maps below convert NOTHING
// today — they exist so the 5.3 backfill (which derives journeys from the CRM
// entities + twins) and any future legacy row land on canonical keys instead of
// inventing new ones.
// ============================================================================
import type { JourneyType } from "./types";
import { isValidStage } from "./machines";

export interface LegacyStageMapping {
  canonical: string;
  /** True when the legacy key has no exact canonical peer and the target was
   *  chosen by nearest lifecycle meaning. The backfill must record this. */
  approximate: boolean;
  /** True when the correct target depends on data outside the stage itself
   *  (e.g. legacy property `closed` → sold vs rented vs archived). */
  ambiguous: boolean;
  note?: string;
}

const m = (canonical: string, opts: Partial<LegacyStageMapping> = {}): LegacyStageMapping => ({
  canonical,
  approximate: false,
  ambiguous: false,
  ...opts,
});

// ── PROPERTY: the live `journey_stage` ENUM (8 values, 10 live rows) ─────────
// This is the ONLY legacy vocabulary with real data behind it.
export const LEGACY_PROPERTY_STAGE_MAP: Record<string, LegacyStageMapping> = {
  new: m("draft"),
  information_collection: m("preparation"),
  marketing_preparation: m("ready_to_publish"),
  published: m("active"),
  active_marketing: m("marketing"),
  negotiation: m("negotiation"),
  // `deal_signed` is post-negotiation, pre-close. It is the reason the canonical
  // PROPERTY machine carries `under_contract` — mapping it back onto
  // `negotiation` would move these properties BACKWARDS during the backfill.
  deal_signed: m("under_contract", {
    note: "legacy enum value with no peer in the original 5.1 stage list; canonical machine adds under_contract",
  }),
  // Legacy `closed` collapses three different outcomes into one key. The 5.3
  // backfill MUST resolve it against properties.status (sold / rented / other),
  // never guess. `archived` is the safe default only when status is unknown.
  closed: m("archived", {
    ambiguous: true,
    note: "resolve against properties.status: sold → sold, rented → rented, otherwise archived",
  }),
};

// ── BUYER: legacy journey_stages.buyer seed catalog (16 keys, 0 rows) ────────
export const LEGACY_BUYER_STAGE_MAP: Record<string, LegacyStageMapping> = {
  new: m("new"),
  discovery: m("qualification", { approximate: true }),
  qualification: m("qualification"),
  budget_validation: m("financing", { approximate: true }),
  financing: m("financing"),
  recommendations: m("matching", { approximate: true }),
  property_exploration: m("properties_sent", { approximate: true }),
  property_comparison: m("properties_sent", { approximate: true }),
  property_visits: m("viewing_completed", { approximate: true }),
  shortlist: m("viewing_completed", { approximate: true }),
  negotiation: m("negotiation"),
  offer: m("negotiation", { approximate: true }),
  deal: m("deal"),
  closing: m("deal", { approximate: true }),
  completed: m("won"),
  dropped: m("lost"),
};

// ── SELLER: legacy journey_stages.seller seed catalog (15 keys, 0 rows) ──────
export const LEGACY_SELLER_STAGE_MAP: Record<string, LegacyStageMapping> = {
  potential: m("new", { approximate: true }),
  valuation: m("valuation"),
  meeting: m("qualification", { approximate: true }),
  proposal: m("pricing", { approximate: true }),
  exclusive_discussion: m("representation", { approximate: true }),
  signed: m("representation", { approximate: true }),
  marketing: m("marketing"),
  lead_generation: m("marketing", { approximate: true }),
  viewings: m("viewings"),
  offers: m("offers"),
  negotiation: m("negotiation"),
  deal: m("deal"),
  closing: m("deal", { approximate: true }),
  completed: m("won"),
  lost: m("lost"),
};

// ── DEAL: the live `deal_stage` enum written by deals/create-actions.ts ──────
// Added in Batch 5.2: `deal.stage_changed` carries these raw values, so the
// canonical machine needs a translation. (deal_journeys is still 0 rows — this
// maps the EVENT vocabulary, not a legacy table.)
export const LEGACY_DEAL_STAGE_MAP: Record<string, LegacyStageMapping> = {
  new: m("initiated"),
  qualified: m("qualification"),
  negotiation: m("negotiation"),
  agreement: m("signing", { approximate: true, note: "terms agreed → moving to signature" }),
  contract: m("legal", { approximate: true, note: "contract drafting/review is the legal phase" }),
  closing: m("closing"),
};

const MAPS: Partial<Record<JourneyType, Record<string, LegacyStageMapping>>> = {
  property: LEGACY_PROPERTY_STAGE_MAP,
  buyer: LEGACY_BUYER_STAGE_MAP,
  seller: LEGACY_SELLER_STAGE_MAP,
  deal: LEGACY_DEAL_STAGE_MAP,
};

/**
 * Translate a legacy stage key to canonical. Returns null when the key is
 * unknown — the backfill must then FALL BACK to the machine's initial stage and
 * record that it did, rather than silently inventing a stage.
 */
export function mapLegacyStage(journeyType: JourneyType, legacyKey: string): LegacyStageMapping | null {
  return MAPS[journeyType]?.[legacyKey] ?? null;
}

/**
 * Resolve the one ambiguous legacy mapping (property `closed`) using the real
 * property status, so the backfill never has to guess.
 */
export function resolveLegacyPropertyClosed(propertyStatus: string | null | undefined): string {
  const s = (propertyStatus ?? "").toLowerCase();
  if (s.includes("sold") || s.includes("נמכר")) return "sold";
  if (s.includes("rent") || s.includes("הושכר")) return "rented";
  return "archived";
}

/** Every legacy map must land on a real canonical stage. Asserted by QA. */
export function legacyMapsAreSound(): boolean {
  return (Object.keys(MAPS) as JourneyType[]).every((t) =>
    Object.values(MAPS[t]!).every((mapping) => isValidStage(t, mapping.canonical)),
  );
}

// ── Deprecation registry ────────────────────────────────────────────────────
// The canonical spine does NOT delete the legacy stage catalogs in 5.1 — that
// would break live surfaces mid-stage. It names them, with live evidence, and
// pins the batch that retires each. This is what keeps "one Journey system"
// true over time instead of just at this commit.
export interface JourneyLegacySource {
  id: string;
  kind: "stage_catalog" | "table" | "service";
  /** Real row count read from the live DB on 2026-07-11 (null = not a table). */
  liveRows: number | null;
  status: "superseded" | "compat_input" | "active_pending_migration";
  retiredIn: string;
  note: string;
}

export const JOURNEY_DEPRECATION_REGISTRY: JourneyLegacySource[] = [
  {
    id: "src/lib/journey/stages.ts",
    kind: "stage_catalog",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "5.5",
    note: "Property stage catalog + checklist. Still drives property_journeys (10 rows) and the property cockpit; migrated onto PROPERTY_MACHINE in 5.5.",
  },
  {
    id: "src/lib/journey-intelligence/engine.ts (BUYER_STAGES/SELLER_STAGES)",
    kind: "stage_catalog",
    liveRows: null,
    status: "superseded",
    retiredIn: "5.5",
    note: "Buyer/seller catalogs. Superseded by BUYER_MACHINE/SELLER_MACHINE; 0 journeys rows exist, so nothing depends on the old keys in data.",
  },
  {
    id: "property_journeys",
    kind: "table",
    liveRows: 10,
    status: "compat_input",
    retiredIn: "5.3 (backfill) / 5.5 (reads)",
    note: "The only legacy journey table with real data. Backfilled into `journeys` via LEGACY_PROPERTY_STAGE_MAP.",
  },
  {
    id: "journey_stages",
    kind: "table",
    liveRows: 31,
    status: "superseded",
    retiredIn: "5.5",
    note: "Seed catalog of buyer/seller stage definitions. The canonical machines replace it as the source of truth; rows stay for compatibility.",
  },
  {
    id: "deal_journeys",
    kind: "table",
    liveRows: 0,
    status: "superseded",
    retiredIn: "5.3",
    note: "Empty. Deal stage history moves to journey_events under DEAL_MACHINE.",
  },
  {
    id: "src/lib/journey-intelligence/service.ts (advanceStage)",
    kind: "service",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "5.5",
    note: "Writes journeys/journey_events directly and still emits legacy status values ('completed'/'dropped'). Rewired onto buildTransition() in 5.5.",
  },
  {
    // ── Batch 5.2 finding — the highest-priority legacy conflict. ────────────
    id: "src/lib/journey-intelligence/service.ts (ensureJourney) — SECOND WRITER of the canonical `journeys` table",
    kind: "service",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "5.3 (must be first)",
    note:
      "LIVE-CALLED from buyers/actions.ts, sellers/actions.ts, leads/service.ts and social/service.ts. It inserts into the CANONICAL journeys table using the LEGACY stage vocabulary — a seller journey opens at 'potential', which is not a canonical stage. journeys_entity_uniq means whichever writer lands first owns the row; if the legacy one wins, the canonical subscriber sees an unknown from-stage and is blocked forever. The 5.2 applier therefore records an explicit 'legacy non-canonical stage' skip instead of guessing or overwriting. Batch 5.3 must (a) backfill these rows onto canonical stages via LEGACY_*_STAGE_MAP and (b) point ensureJourney at the canonical spine — before any further journey work.",
  },
  {
    // ── Part 12: the timeline dual-write the Live Runtime Gate observed. ─────
    id: "TIMELINE DUAL-WRITE — imperative activity_events writers (event_id NULL) alongside the kernel projection",
    kind: "service",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "5.3 / legacy-retirement",
    note:
      "Observed live during the runtime gate: one lead.created produced TWO timeline rows — a direct app write at 11:24:12 (event_id NULL, source NULL) and the kernel projection at 11:30:22 (event_id set, source 'kernel'). Not a kernel duplicate (the idempotency index is per event_id) but the same fact is shown twice. Do NOT fix this by hiding kernel rows. Required order: inventory every imperative writer, map each to its canonical event, prove kernel parity, THEN retire the direct write. Historical rows are preserved.",
  },
];

export function journeyRegistryCounts(): Record<JourneyLegacySource["status"], number> {
  const out = { superseded: 0, compat_input: 0, active_pending_migration: 0 };
  for (const r of JOURNEY_DEPRECATION_REGISTRY) out[r.status]++;
  return out;
}
