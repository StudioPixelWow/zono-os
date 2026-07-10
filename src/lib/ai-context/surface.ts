// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · grounding surface (server).
// The ONE grounding entry every reasoning surface calls — cockpits, Broker Brain,
// Daily OS, Executive AI, recommendation explanations. Each delegates to the ONE
// assembler (assembleEntityContext) with the correct mode, applies the canonical-
// truth conflict rule (stale memory dropped from fact, provenance preserved), and
// returns a permission-safe GroundedContext with a provenance summary + partial-
// context diagnostics. No surface builds its own context, memory reader, graph
// reader, timeline assembler, or permission logic — they all come from here.
// ============================================================================
import "server-only";
import { assembleEntityContext } from "./assembler";
import { renderContextText, hasContextSignal, type ProvenanceItem, type ContextDiagnostics } from "./render";
import { modePolicy, type ContextMode } from "./modes";
import { detectStaleMemory, type CanonicalFact, type StaleMemo } from "./stale";
import type { GroundedSummary } from "./grounding-summary";

export interface ProvenanceSummary {
  total: number;
  byLayer: Record<string, number>;
  explicit: number;
  derived: number;
  inferred: number;
}

/** A permission-safe, provenance-preserving context envelope for a reasoning surface. */
export interface GroundedContext {
  mode: ContextMode;
  entityType: string;
  entityId: string;
  truthLine: string | null;
  contextText: string;              // rendered, prompt-safe (or "")
  provenance: ProvenanceItem[];     // structured evidence per item (PART 10)
  provenanceSummary: ProvenanceSummary;
  staleMemory: StaleMemo[];         // conflicting memory (never presented as fact)
  diagnostics: ContextDiagnostics;  // failed layers + truncation (PART 9/11)
  hasSignal: boolean;
}

function summarize(prov: ProvenanceItem[]): ProvenanceSummary {
  const byLayer: Record<string, number> = {};
  let explicit = 0, derived = 0, inferred = 0;
  for (const p of prov) {
    byLayer[p.layer] = (byLayer[p.layer] ?? 0) + 1;
    if (p.provenance === "explicit") explicit++;
    else if (p.provenance === "derived") derived++;
    else if (p.provenance === "inferred") inferred++;
  }
  return { total: prov.length, byLayer, explicit, derived, inferred };
}

const EMPTY_DIAG: ContextDiagnostics = { failedLayers: [], truncated: {} };

/**
 * Ground a single ENTITY's reasoning context (cockpits + entity Ask + "why?").
 * Defaults to internal_entity mode. Pass the entity's current canonical facts so
 * stale/contradicting memory is demoted (truth wins) while its provenance is kept.
 */
export async function groundEntityContext(
  entityType: string,
  entityId: string,
  opts: { mode?: ContextMode; canonicalTruth?: CanonicalFact[] } = {},
): Promise<GroundedContext> {
  const mode: ContextMode = opts.mode ?? "internal_entity";
  const ctx = await assembleEntityContext({ mode, entityType, entityId });

  const { stale } = opts.canonicalTruth?.length
    ? detectStaleMemory(opts.canonicalTruth, ctx.memory)
    : { stale: [] as StaleMemo[] };
  const staleFacts = new Set(stale.map((s) => s.fact));
  // Canonical truth wins: stale memory is removed from what we present as fact.
  const freshCtx = { ...ctx, memory: ctx.memory.filter((m) => !staleFacts.has(m.fact)) };

  const contextText = renderContextText(freshCtx, { forBroadPrompt: modePolicy(mode).forBroadPrompt });
  const provenance = ctx.provenance ?? [];
  return {
    mode, entityType, entityId,
    truthLine: ctx.truthLine,
    contextText,
    provenance,
    provenanceSummary: summarize(provenance),
    staleMemory: stale,
    diagnostics: ctx.diagnostics ?? EMPTY_DIAG,
    hasSignal: hasContextSignal(freshCtx),
  };
}

/**
 * Ground a GLOBAL (org/broker-wide) reasoning context — Broker Brain, Daily OS,
 * Executive AI. Uses org memory + org-wide recommendations under the given mode
 * (executive NEVER includes broker-private memory; that's enforced by modePolicy).
 */
export async function groundGlobalContext(
  mode: Extract<ContextMode, "internal_global" | "broker_private" | "executive">,
): Promise<GroundedContext> {
  const ctx = await assembleEntityContext({ mode }); // no entity → global assembly
  const contextText = renderContextText(ctx, { forBroadPrompt: modePolicy(mode).forBroadPrompt });
  const provenance = ctx.provenance ?? [];
  return {
    mode, entityType: ctx.entityType, entityId: ctx.entityId,
    truthLine: ctx.truthLine,
    contextText,
    provenance,
    provenanceSummary: summarize(provenance),
    staleMemory: [],
    diagnostics: ctx.diagnostics ?? EMPTY_DIAG,
    hasSignal: hasContextSignal(ctx),
  };
}

/** Ground a recommendation's "why?" enrichment context (recommendation_explanation mode). */
export async function groundRecommendationContext(entityType: string, entityId: string): Promise<GroundedContext> {
  return groundEntityContext(entityType, entityId, { mode: "recommendation_explanation" });
}

/** Map a GroundedContext to the ONE client-safe summary surfaces attach to their output. */
export function toGroundedSummary(g: GroundedContext): GroundedSummary {
  return {
    mode: g.mode, contextText: g.contextText,
    provenance: { total: g.provenanceSummary.total, explicit: g.provenanceSummary.explicit, derived: g.provenanceSummary.derived, inferred: g.provenanceSummary.inferred },
    staleCount: g.staleMemory.length, failedLayers: g.diagnostics.failedLayers, truncated: g.diagnostics.truncated,
    hasSignal: g.hasSignal,
  };
}
