// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.3 · Legacy stage RESOLUTION (PURE).
//
// Batch 5.1 gave us the per-vocabulary maps. This file is the layer above them:
// ONE resolver that every legacy value in ZONO passes through, with an explicit
// MAPPING QUALITY on every answer, plus the "never move a journey backward" rule
// that the backfill and the compatibility adapter both depend on.
//
// LIVE VOCABULARY CENSUS (zono-dev, read 2026-07-11 — five vocabularies, all real):
//   1. journey_stage ENUM        → property_journeys.current_stage   (9 live rows)
//   2. properties.status         → the property's own lifecycle      (9 live rows)
//   3. journey_stages catalog    → buyer (16 keys) + seller (15 keys) (31 seed rows)
//   4. deals.stage / deal_profiles.deal_stage → the two deal vocabularies (5.2)
//   5. leads.stage               → LEAD_STAGES in leads/service.ts
//
// (2) and (5) were NOT mapped before this batch. (2) is the important one: every
// live property_journey row is STALE (stage_history empty, last touched at
// creation) while properties.status kept moving. Backfilling the legacy stage
// alone would open a published property's journey at `draft`.
//
// Nothing here guesses. An unknown key resolves to `unmappable` and the backfill
// reports it for review rather than inventing a stage.
// ============================================================================
import type { JourneyType } from "./types";
import { isValidStage, machineFor, stageDef } from "./machines";
import { mapLegacyStage, type LegacyStageMapping } from "./legacy-map";

/** How much we trust a legacy → canonical mapping. Recorded on every backfill row. */
export type MappingQuality =
  | "exact"        // same business meaning; safe to backfill automatically
  | "approximate"  // nearest lifecycle meaning; backfilled but tagged
  | "terminal"     // maps onto a terminal stage (won / lost / sold / archived)
  | "ambiguous"    // the key alone cannot decide; needs a second field
  | "unmappable";  // no canonical peer — never guessed, always reported

export interface ResolvedStage {
  canonical: string | null;
  quality: MappingQuality;
  /** The raw legacy value, always preserved for metadata. */
  legacy: string;
  /** The vocabulary the value came from. */
  vocabulary: LegacyVocabulary;
  note?: string;
}

export type LegacyVocabulary =
  | "journey_stage_enum"     // property_journeys.current_stage
  | "properties_status"      // properties.status
  | "journey_stages_buyer"   // journey_stages catalog (buyer)
  | "journey_stages_seller"  // journey_stages catalog (seller)
  | "deal_stage"             // deals.stage + deal_profiles.deal_stage
  | "leads_stage";           // leads.stage

// ── VOCABULARY 2 (NEW in 5.3): properties.status ────────────────────────────
// The property's OWN lifecycle field. Live values today are only `active` and
// `published`, but the full column vocabulary is mapped so a status change can
// never surprise the backfill.
export const LEGACY_PROPERTY_STATUS_MAP: Record<string, { canonical: string; quality: MappingQuality; note?: string }> = {
  draft: { canonical: "draft", quality: "exact" },
  // Both `active` and `published` mean the same thing in ZONO: the listing is
  // live and publicly visible. The canonical PROPERTY machine calls that `active`.
  active: { canonical: "active", quality: "exact" },
  published: { canonical: "active", quality: "exact" },
  under_offer: { canonical: "offers", quality: "exact" },
  in_contract: { canonical: "under_contract", quality: "exact" },
  sold: { canonical: "sold", quality: "terminal" },
  rented: { canonical: "rented", quality: "terminal" },
  withdrawn: { canonical: "paused", quality: "approximate", note: "withdrawn from market — the canonical machine calls a reversible stop `paused`" },
  archived: { canonical: "archived", quality: "terminal" },
};

// ── VOCABULARY 5 (NEW in 5.3): leads.stage (LEAD_STAGES) ────────────────────
export const LEGACY_LEAD_STAGE_MAP: Record<string, { canonical: string; quality: MappingQuality; note?: string }> = {
  new: { canonical: "new", quality: "exact" },
  contacted: { canonical: "contacted", quality: "exact" },
  qualified: { canonical: "qualified", quality: "exact" },
  nurturing: { canonical: "nurturing", quality: "exact" },
  converted: { canonical: "converted", quality: "terminal" },
  lost: { canonical: "lost", quality: "terminal" },
  // `disqualified` is a REAL live key with no canonical peer. It is NOT the same
  // as `lost` (lost = we failed to win them; disqualified = they were never a
  // real prospect). We refuse to collapse them. Batch 5.5 either adds the stage
  // or the business decides they are the same — until then it is reported.
  disqualified: { canonical: null as unknown as string, quality: "unmappable", note: "no canonical peer; NOT collapsed into `lost` — reported for review" },
};

const qualityFromMapping = (m: LegacyStageMapping): MappingQuality => {
  if (m.ambiguous) return "ambiguous";
  if (m.approximate) return "approximate";
  return "exact";
};

/**
 * Resolve ONE legacy value from ONE named vocabulary. Never throws, never guesses.
 */
export function resolveLegacyStage(
  journeyType: JourneyType,
  vocabulary: LegacyVocabulary,
  legacy: string | null | undefined,
): ResolvedStage {
  const raw = (legacy ?? "").trim();
  const miss = (note?: string): ResolvedStage =>
    ({ canonical: null, quality: "unmappable", legacy: raw, vocabulary, note });
  if (!raw) return miss("empty legacy value");

  // Already canonical? Then it needs no mapping at all.
  if (isValidStage(journeyType, raw)) {
    const def = stageDef(journeyType, raw);
    return {
      canonical: raw, legacy: raw, vocabulary,
      quality: def && def.terminal ? "terminal" : "exact",
      note: "already a canonical stage",
    };
  }

  if (vocabulary === "properties_status") {
    const m = LEGACY_PROPERTY_STATUS_MAP[raw];
    if (!m) return miss(`unknown properties.status '${raw}'`);
    return { canonical: m.canonical, quality: m.quality, legacy: raw, vocabulary, note: m.note };
  }

  if (vocabulary === "leads_stage") {
    const m = LEGACY_LEAD_STAGE_MAP[raw];
    if (!m || !m.canonical) return miss(m?.note ?? `unknown leads.stage '${raw}'`);
    return { canonical: m.canonical, quality: m.quality, legacy: raw, vocabulary, note: m.note };
  }

  // journey_stage_enum / journey_stages_buyer / journey_stages_seller / deal_stage
  // all go through the Batch 5.1 + 5.2 maps.
  const m = mapLegacyStage(journeyType, raw);
  if (!m) return miss(`no mapping for '${raw}' in ${journeyType}`);
  const q = qualityFromMapping(m);
  const def = stageDef(journeyType, m.canonical);
  return {
    canonical: m.canonical,
    quality: q === "exact" && def?.terminal ? "terminal" : q,
    legacy: raw,
    vocabulary,
    note: m.note,
  };
}

/** True when the resolver produced a stage the backfill may actually write. */
export function isBackfillable(r: ResolvedStage): boolean {
  return !!r.canonical && r.quality !== "unmappable" && r.quality !== "ambiguous";
}

/** Ladder position of a canonical stage (higher = further along). -1 if unknown. */
export function stagePosition(journeyType: JourneyType, stage: string | null): number {
  if (!stage) return -1;
  return stageDef(journeyType, stage)?.position ?? -1;
}

/**
 * "Never move a journey backward."
 *
 * Given two pieces of REAL evidence about the same entity, return the one that
 * is further along the canonical ladder. Used by the backfill when the legacy
 * journey row and the entity's own lifecycle field disagree — which is the norm,
 * not the exception: every live property_journey is stale (stage_history empty,
 * untouched since creation) while properties.status kept moving.
 *
 * This is not a guess. Both inputs are real, both are mapped, and picking the
 * more advanced of two truths is exactly the no-regression rule.
 */
export function mostAdvancedStage(
  journeyType: JourneyType,
  a: string | null,
  b: string | null,
): string | null {
  if (!a) return b;
  if (!b) return a;
  const pa = stagePosition(journeyType, a);
  const pb = stagePosition(journeyType, b);
  if (pa < 0) return b;
  if (pb < 0) return a;
  return pb > pa ? b : a;
}

/**
 * COMPATIBILITY ADAPTER (Part 2) — the stage a legacy caller is allowed to open
 * a journey at.
 *
 * journey-intelligence's ensureJourney used to insert `stagesFor(type)[0].key`
 * straight into the canonical table: `new` for a buyer (which happens to be
 * canonical) and **`potential` for a seller (which is NOT)**. A seller journey
 * opened at `potential` blocks the kernel subscriber forever, because
 * buildTransition() sees an unknown `from`.
 *
 * After 5.3 no caller picks the stage. They pass their legacy intent (or
 * nothing) and this returns a stage the machine will accept — or null, which the
 * adapter turns into an honest diagnostic instead of a bad row.
 */
export function compatOpenStage(
  journeyType: JourneyType,
  requestedLegacyStage?: string | null,
): { stage: string; resolved: ResolvedStage | null } | { stage: null; resolved: ResolvedStage } {
  const vocab: LegacyVocabulary =
    journeyType === "seller" ? "journey_stages_seller"
      : journeyType === "buyer" ? "journey_stages_buyer"
        : journeyType === "deal" ? "deal_stage"
          : journeyType === "lead" ? "leads_stage"
            : "journey_stage_enum";

  if (requestedLegacyStage) {
    const r = resolveLegacyStage(journeyType, vocab, requestedLegacyStage);
    if (isBackfillable(r) && r.canonical) return { stage: r.canonical, resolved: r };
    return { stage: null, resolved: r };   // honest diagnostic — never a raw legacy write
  }
  // No stage requested → open at the machine's own initial stage. This is the
  // path buyers/sellers/leads/social take, and it is why a seller can never
  // again be created at `potential`.
  return { stage: machineFor(journeyType).initial, resolved: null };
}
