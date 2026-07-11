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

// ── DEAL: ZONO runs TWO deal-stage vocabularies, and both reach the kernel ────
//
// LIVE EVIDENCE (Batch 5.2 runtime verification, 2026-07-11 12:30 UTC):
//   · `deals.stage`            = DEAL_STAGE_OPTIONS (deals/options.ts) — carried by
//                                deal.created, written by the ⌘K quick-create.
//   · `deal_profiles.deal_stage` = DealStage (deals/engine.ts) — carried by
//                                deal.stage_changed / deal.won / deal.lost, written
//                                by advanceDealStage(), which is what the Deals OS
//                                board actually calls.
// The first version of this map only covered the FIRST vocabulary, so a real
// stage advance ("קדם ליצירת קשר" → `contacted`) was honestly skipped as
// `unmappable_stage` and the deal journey could never move. Observed live:
//   deal.stage_changed → journey delivery status=skipped reason=unmappable_stage
//                        detail="contacted"
// Both vocabularies are mapped below. They collide on exactly one key
// (`negotiation`) and agree on its target, so one map is safe.
export const LEGACY_DEAL_STAGE_MAP: Record<string, LegacyStageMapping> = {
  // deals.stage (deal.created)
  new: m("initiated"),
  qualified: m("qualification"),
  agreement: m("signing", { approximate: true, note: "terms agreed → moving to signature" }),
  contract: m("legal", { approximate: true, note: "contract drafting/review is the legal phase" }),
  closing: m("closing"),
  // deal_profiles.deal_stage (deal.stage_changed / won / lost) — the vocabulary
  // the live Deals OS board emits.
  new_opportunity: m("initiated"),
  contacted: m("qualification", { approximate: true, note: "first real contact opens the qualification phase; the canonical machine has no separate 'contacted' rung" }),
  meeting_scheduled: m("qualification", { approximate: true, note: "still qualifying — the deal machine has no meeting stage (meetings are buyer/lead journey evidence)" }),
  property_visit: m("qualification", { approximate: true, note: "a visit inside a deal is still qualification; viewings live on the buyer/property journeys" }),
  negotiation: m("negotiation"),
  offer_sent: m("offer"),
  offer_received: m("offer"),
  agreement_draft: m("legal", { approximate: true, note: "drafting the agreement is the legal phase; `signed` is the signing rung" }),
  legal_review: m("legal"),
  signed: m("signing"),
  // Defensive: these two are emitted as deal.won / deal.lost (not stage_changed),
  // so the subscriber handles them directly — mapped anyway so no vocabulary hole.
  closed: m("won"),
  lost: m("lost"),
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
  kind: "stage_catalog" | "table" | "service" | "read_model";
  /** Real row count read from the live DB on 2026-07-11 (null = not a table). */
  liveRows: number | null;
  status: "superseded" | "compat_input" | "active_pending_migration" | "retired";
  retiredIn: string;
  note: string;
  // ── Batch 5.3 (Part 10): nothing may remain hidden or undocumented. ────────
  /** What replaces it in the canonical world. */
  replacement?: string;
  /** Who still READS it today. */
  activeReaders?: string[];
  /** Who still WRITES it today. Empty = safe from a write standpoint. */
  activeWriters?: string[];
  /** Can it be deleted now, and if not, what blocks it. */
  removalEligibility?: "now" | "after_backfill" | "after_ui_cutover" | "blocked";
  /** The honest risk of leaving it in place. */
  remainingRisk?: string;
}

export const JOURNEY_DEPRECATION_REGISTRY: JourneyLegacySource[] = [
  // ══ RETIRED IN 5.3 ════════════════════════════════════════════════════════
  {
    id: "src/lib/journey-intelligence/service.ts (ensureJourney) — SECOND WRITER of the canonical `journeys` table",
    kind: "service",
    liveRows: null,
    status: "retired",
    retiredIn: "5.3 — DONE",
    replacement: "journey-backfill/service.ts::openCanonicalJourney (the ONE command-side creator)",
    activeReaders: [],
    activeWriters: [],
    removalEligibility: "now",
    remainingRisk: "none — it no longer touches `journeys`; it is a signature-compatible adapter so its four callers were not disturbed.",
    note:
      "WAS: inserted stagesFor(type)[0].key straight into the canonical table — `new` for a buyer (canonical by luck) and `potential` for a SELLER (NOT canonical). It runs synchronously inside the create action while the kernel drain runs up to 10 minutes later, so it ALWAYS won the journeys_entity_uniq race; a seller journey opened at `potential` would then be rejected by buildTransition() on every future move and frozen forever, silently. NOW: a thin adapter over openCanonicalJourney(). It cannot choose a stage, cannot overwrite a kernel journey, and returns an honest error instead of writing a row the machine would refuse.",
  },
  {
    id: "src/lib/journey-intelligence/service.ts (advanceStage) — second stage writer",
    kind: "service",
    liveRows: null,
    status: "retired",
    retiredIn: "5.3 — DONE",
    replacement: "buildTransition() + the canonical machine (same validator the kernel uses)",
    activeReaders: [],
    activeWriters: ["journey-intelligence/actions.ts::advanceStageAction (now validated)"],
    removalEligibility: "after_ui_cutover",
    remainingRisk: "low — it still writes `journeys`, but every stage now passes resolveLegacyStage() + buildTransition() and the head update carries the same stale-write guard as the kernel applier.",
    note:
      "WAS: accepted any key from the LEGACY catalog and wrote it straight into journeys.current_stage, plus its own legacy status vocabulary ('completed'/'dropped') — a second door through which `potential`, `proposal`, `budget_validation` could walk into the canonical table. NOW: resolved → validated → guarded. Refuses to move a journey that is still sitting on a pre-5.3 legacy stage, pointing the operator at the backfill instead of corrupting it further.",
  },

  // ══ COMPATIBILITY INPUTS — read-only sources for the backfill ══════════════
  {
    id: "property_journeys",
    kind: "table",
    liveRows: 9,
    status: "compat_input",
    retiredIn: "5.5 (reads)",
    replacement: "journeys + journey_events (journey_type='property')",
    activeReaders: ["src/lib/journey/repository.ts", "src/lib/intelligence/service.ts:71", "the property cockpit"],
    activeWriters: ["src/lib/journey/repository.ts (property stage advance)"],
    removalEligibility: "after_ui_cutover",
    remainingRisk:
      "It keeps being written by the property cockpit, so it can drift again. It does NOT corrupt the canonical spine (the backfill never regresses and the kernel always wins), but until 5.5 points the cockpit at the canonical machine there are two property stage stores.",
    note:
      "The only legacy journey table with real data. LIVE (2026-07-11): 9 rows across 2 orgs, stages `new` (7) and `active_marketing` (2). EVERY row is STALE — stage_history is empty and updated_at has not moved since creation, while properties.status kept advancing. Backfilled in 5.3 using the more-advanced of (legacy stage, properties.status), never backward.",
  },
  {
    id: "journey_stages",
    kind: "table",
    liveRows: 31,
    status: "compat_input",
    retiredIn: "5.5",
    replacement: "BUYER_MACHINE / SELLER_MACHINE (code, not data)",
    activeReaders: ["journey-intelligence/engine.ts (indirectly, via its own hardcoded catalogs)"],
    activeWriters: [],
    removalEligibility: "after_ui_cutover",
    remainingRisk: "none — it is a seed catalog nobody writes. Left in place so no live read 404s.",
    note: "Seed catalog: buyer 16 keys, seller 15 keys. The canonical machines replace it as the source of truth. Untouched by 5.3 (the batch explicitly forbids altering it).",
  },
  {
    id: "deal_journeys",
    kind: "table",
    liveRows: 0,
    status: "compat_input",
    retiredIn: "5.5",
    replacement: "journey_events (journey_type='deal')",
    activeReaders: ["deals/service.ts"],
    activeWriters: ["deals/service.ts::advanceDealStage"],
    removalEligibility: "after_ui_cutover",
    remainingRisk:
      "Keyed by deal_profiles.id, so anything read from it must be resolved to public.deals.id first. The 5.3 backfill does exactly that and REFUSES to key a journey on a profile id.",
    note: "Empty today (0 rows), but still actively written on every deal stage advance. The 5.3 backfill handles it correctly the moment it has rows.",
  },

  // ══ STILL ACTIVE — documented, scheduled, not yet safe to remove ═══════════
  {
    id: "src/lib/journey/stages.ts",
    kind: "stage_catalog",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "5.5",
    replacement: "PROPERTY_MACHINE",
    activeReaders: ["property cockpit", "journey/repository.ts"],
    activeWriters: ["journey/repository.ts"],
    removalEligibility: "after_ui_cutover",
    remainingRisk: "It is the vocabulary behind property_journeys; while the cockpit writes through it, property stage drift can recur.",
    note: "Property stage catalog + checklist (the 8-value journey_stage enum). Migrated onto PROPERTY_MACHINE in 5.5.",
  },
  {
    id: "src/lib/journey-intelligence/engine.ts (BUYER_STAGES/SELLER_STAGES)",
    kind: "stage_catalog",
    liveRows: null,
    status: "superseded",
    retiredIn: "5.5",
    replacement: "BUYER_MACHINE / SELLER_MACHINE",
    activeReaders: ["journey-intelligence scoring/labels"],
    activeWriters: [],
    removalEligibility: "after_ui_cutover",
    remainingRisk:
      "none for DATA — after 5.3 no code path can write these keys into `journeys`. They survive only as labels/scoring input.",
    note: "The catalogs whose first seller key is `potential`. 5.3 severed them from the write path; 5.5 removes them.",
  },
  {
    id: "src/lib/journey-center (derived read model) — PRIMARY read RETIRED in 5.4",
    kind: "read_model",
    liveRows: null,
    status: "compat_input",
    retiredIn: "5.4 (primary) / 5.5 (fallback + derive.ts)",
    replacement: "journey-center/service.ts — canonical-first over journeys + journey_events",
    activeReaders: ["/journeys page (FALLBACK path only)"],
    activeWriters: [],
    removalEligibility: "after_ui_cutover",
    remainingRisk:
      "The derived model is NO LONGER the primary read: /journeys reads the canonical spine first and only falls back for entities with no canonical journey — always MARKED, never shown alongside a canonical row for the same entity. What remains is derive.ts and its private stage vocabulary (a SIXTH one: property `marketed`/`stale`, etc). Those keys are mapped onto the canonical ladder by journey-center/canonical.ts; anything unmappable is EXCLUDED and reported in `diagnostics`, never guessed. Retire derive.ts in 5.5 once every entity has a canonical journey.",
    note: "Built because `journeys` used to be empty. Batch 5.4 inverted the read order; the derived path survives only as a compatibility fallback.",
  },
  {
    id: "DEAL DUAL IDENTITY — deals.id vs deal_profiles.id",
    kind: "table",
    liveRows: 0,
    status: "active_pending_migration",
    retiredIn: "5.5",
    replacement: "public.deals.id as the ONLY deal entity id",
    activeReaders: ["Deals OS board (reads deal_profiles)"],
    activeWriters: ["deals/create-actions.ts (deals + deal_profiles)", "deals/service.ts::advanceDealStage (deal_profiles)"],
    removalEligibility: "after_ui_cutover",
    remainingRisk:
      "The EVENT layer is fixed (5.2: deal.* now carries deals.id) and the 5.3 backfill resolves deal_journeys through deal_profiles.deal_id, refusing rows where deal_id IS NULL. The two TABLES still coexist, so a deal_profile created without a canonical deal would be unanchorable — reported as a conflict, never guessed.",
    note: "Found by 5.2 live verification: the same business deal existed under two ids. Fixed at the emitter; the table-level merge is a 5.5 concern.",
  },
  {
    id: "TIMELINE DUAL-WRITE — imperative activity_events writers (event_id NULL) alongside the kernel projection",
    kind: "service",
    liveRows: null,
    status: "active_pending_migration",
    retiredIn: "deferred — see remainingRisk",
    replacement: "the kernel timeline subscriber (activity_events with event_id set, source='kernel')",
    activeReaders: ["every timeline surface"],
    activeWriters: [
      "leads/actions.ts:54 (lead.created) — kernel parity LIVE-PROVEN",
      "leads/service.ts:72,105 (lead.stage_changed)",
      "buyers/actions.ts:43 (buyer.created)",
      "sellers/actions.ts:45,50 (seller.created / linked_to_property)",
      "properties/actions.ts:42 (property.created / status_changed)",
      "deals/deal-property-sync.ts:36 (property.sold)",
      "office-website/service.ts:222 + agent-website/service.ts:189 (lead.created from public sites)",
    ],
    removalEligibility: "blocked",
    remainingRisk:
      "RETIREMENT IS BLOCKED BY DRAIN LATENCY, NOT BY PARITY. Kernel parity for lead.created is live-proven (5.2 gate: the same fact landed twice — a direct row at 11:24:12 with event_id NULL, and the kernel projection at 11:30:22 with event_id set). But the cron runs every 10 minutes, so deleting the direct write today means a broker creates a lead and sees NOTHING on the timeline for up to 10 minutes. That is a real product regression, so 5.3 does NOT retire it. Unblocking it needs either a near-real-time drain or an optimistic UI row that the kernel later reconciles. Do NOT 'fix' this by hiding kernel rows in the UI — that hides the duplicate instead of removing it. Historical rows are preserved either way.",
    note: "Inventoried in full (10 call sites across 9 files). Classified. Not retired — and the reason is stated rather than dressed up.",
  },
];


export function journeyRegistryCounts(): Record<JourneyLegacySource["status"], number> {
  const out = { superseded: 0, compat_input: 0, active_pending_migration: 0, retired: 0 };
  for (const r of JOURNEY_DEPRECATION_REGISTRY) out[r.status]++;
  return out;
}
