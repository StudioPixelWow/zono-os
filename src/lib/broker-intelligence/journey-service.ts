// ============================================================================
// 🧭 ZONO OS 2.0 — Stage 5 · Batch 5.6E · BROKER INTELLIGENCE · Area 5 · Journey
// service (server-only). Feeds the pure journey engine from the CANONICAL spine
// in ONE batched pass (no N+1):
//   • journeys       — the canonical lifecycle row (stage / status / type)
//   • journey_events — the movement ledger; the ONLY admissible proof of when a
//                      stage was really entered
//   • subject tables — resolved through the EXISTING SEARCH_CONFIG (title +
//                      route), so no second route/label registry is invented
//
// Org scoping: `createClient()` (RLS) — identical to every other area service;
// `journeys` + `journey_events` both have RLS enabled (live-verified). Never
// throws — a failure degrades to an empty area, never a blank queue.
//
// THE PROOF RULE: a journey_event counts as proof of stage entry ONLY when
// `source_event_id` is present — i.e. it is traceable back to the `domain_events`
// outbox and therefore to a real business event. Backfill seeds carry a NULL
// source_event_id and an occurred_at equal to the moment the backfill script ran;
// treating those as a dwell clock would measure the script, not the business.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankJourneys, STALL_DAYS, type JourneySignals } from "./journey";
import type { Recommendation } from "./types";
import { isJourneyType, type JourneyType } from "@/lib/journey-canonical";
import { SEARCH_CONFIG, SEARCH_TABLE_MAP, pick } from "@/lib/search-projection";

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY));
};

export interface JourneyIntelligence {
  recommendations: Recommendation[];
  scanned: number;
  actionable: number;
  /** Journeys whose stage entry has NO kernel-traceable proof (backfill-seeded).
   *  Surfaced so an honest zero is auditable rather than looking like a bug. */
  unverifiedStageEntry: number;
  generatedAt: string;
}

type Row = Record<string, unknown>;
const str = (r: Row, k: string): string | null => {
  const v = r[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/**
 * Batch 5.6E/5.6F observability — the Journey source must be VISIBLE on EVERY
 * path, including the zero paths. aggregate-service fans engines out through
 * Promise.allSettled and swallows failures by design, so without a line on each
 * exit an evidence-gated zero is indistinguishable from a crashed engine.
 * Counts only — no titles, no subject PII.
 */
export type JourneyDiagReason = "no_visible_journeys" | "evaluated" | "error";

function diag(reason: JourneyDiagReason, payload: Record<string, unknown> = {}): void {
  console.info("[broker-intelligence][journey]", JSON.stringify({ reason, stallDays: STALL_DAYS, ...payload }));
}

/** Rank the canonical journeys that are provably stalled. Never throws. */
export async function getJourneyIntelligence(limit = 12): Promise<JourneyIntelligence> {
  const empty: JourneyIntelligence = {
    recommendations: [], scanned: 0, actionable: 0, unverifiedStageEntry: 0,
    generatedAt: new Date().toISOString(),
  };
  try {
    const db = await createClient();
    const { data: jdata } = await db
      .from("journeys")
      .select("id,journey_type,entity_type,entity_id,current_stage,status,stage_entered_at")
      .eq("status", "active")
      .limit(500);
    const journeys = (jdata as unknown as Row[]) ?? [];
    // Log BEFORE returning: "no journeys visible" is precisely the case the
    // diagnostic exists to make visible. An early return that skips it would
    // reproduce the exact blind spot this observability was added to close.
    if (!journeys.length) {
      diag("no_visible_journeys", { scanned: 0, actionable: 0, unverifiedStageEntry: 0, belowThreshold: 0 });
      return empty;
    }

    const journeyIds = journeys.map((j) => str(j, "id")).filter((x): x is string => !!x);

    // Movement ledger — ONLY kernel-traceable rows are admissible as proof.
    const { data: edata } = await db
      .from("journey_events")
      .select("journey_id,to_stage,occurred_at,source_event_id")
      .in("journey_id", journeyIds)
      .not("source_event_id", "is", null)
      .limit(5000);
    const events = (edata as unknown as Row[]) ?? [];

    // journeyId → { verified transitions, latest proven entry per stage }
    const proof = new Map<string, { count: number; lastAt: string | null; byStage: Map<string, string> }>();
    for (const e of events) {
      const jid = str(e, "journey_id");
      const at = str(e, "occurred_at");
      if (!jid || !at) continue;
      const cur = proof.get(jid) ?? { count: 0, lastAt: null, byStage: new Map<string, string>() };
      cur.count += 1;
      if (!cur.lastAt || at > cur.lastAt) cur.lastAt = at;
      const to = str(e, "to_stage");
      // Keep the MOST RECENT entry into each stage (a journey can re-enter one).
      if (to) {
        const prev = cur.byStage.get(to);
        if (!prev || at > prev) cur.byStage.set(to, at);
      }
      proof.set(jid, cur);
    }

    // Batched subject resolution — one query per subject table, reusing the
    // EXISTING search config for titles + routes (no second registry).
    const idsByType = new Map<string, Set<string>>();
    for (const j of journeys) {
      const st = str(j, "entity_type");
      const sid = str(j, "entity_id");
      if (st && sid && SEARCH_TABLE_MAP[st]) {
        (idsByType.get(st) ?? idsByType.set(st, new Set()).get(st)!).add(sid);
      }
    }
    const subjects = new Map<string, Row>();
    for (const [st, ids] of idsByType) {
      const { data: sdata } = await db.from(SEARCH_TABLE_MAP[st] as never).select("*").in("id", [...ids] as never);
      for (const r of (sdata as unknown as Row[]) ?? []) {
        const id = str(r, "id");
        if (id) subjects.set(`${st}:${id}`, r);
      }
    }

    let unverifiedStageEntry = 0;
    const signals: JourneySignals[] = [];
    for (const j of journeys) {
      const journeyId = str(j, "id");
      const jtRaw = str(j, "journey_type") ?? str(j, "entity_type");
      const subjectType = str(j, "entity_type");
      const subjectId = str(j, "entity_id");
      const currentStage = str(j, "current_stage");
      if (!journeyId || !jtRaw || !isJourneyType(jtRaw) || !subjectType || !subjectId || !currentStage) continue;

      const subject = subjects.get(`${subjectType}:${subjectId}`);
      if (!subject) continue; // subject gone / not visible → nothing to act on
      const cfg = SEARCH_CONFIG[subjectType];
      const subjectTitle = (cfg ? pick(subject, cfg.title) : null) ?? "ללא כותרת";

      const p = proof.get(journeyId);
      const provenEntry = p?.byStage.get(currentStage) ?? null;
      if (!provenEntry) unverifiedStageEntry++;

      signals.push({
        journeyId,
        journeyType: jtRaw as JourneyType,
        subjectType,
        subjectId,
        subjectTitle,
        href: cfg ? cfg.route(subjectId) : null,
        currentStage,
        status: str(j, "status") ?? "active",
        // NULL unless a kernel-traceable event proves the entry. Deliberately
        // NOT falling back to journeys.stage_entered_at — see journey.ts.
        daysInStage: daysSince(provenEntry),
        verifiedTransitions: p?.count ?? 0,
        daysSinceLastTransition: daysSince(p?.lastAt ?? null),
      });
    }

    const ranked = rankJourneys(signals);
    const actionable = ranked.filter((r) => !r.insufficientEvidence).length;

    diag("evaluated", {
      scanned: signals.length,
      actionable,
      unverifiedStageEntry,
      belowThreshold: signals.filter((s) => s.daysInStage != null && s.daysInStage < STALL_DAYS).length,
    });

    return {
      recommendations: ranked.slice(0, limit),
      scanned: signals.length,
      actionable,
      unverifiedStageEntry,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    // Emit on the SAME channel as the success paths, so "engine failed" and
    // "engine found nothing" are never confused by their absence/presence.
    diag("error", { error: e instanceof Error ? e.message : "unknown" });
    console.error("[broker-intelligence] journey failed:", e);
    return empty;
  }
}
