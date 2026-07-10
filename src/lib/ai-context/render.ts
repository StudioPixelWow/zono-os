// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · render (PURE).
// Composes the assembled context layers into ONE compact, prompt-safe Hebrew
// block. Deterministic + offline-testable. For BROAD prompts it drops
// confidential/restricted memory (permission-safe by construction) and never
// emits secrets/tokens/raw payloads (the assembler only passes safe facts in).
// Layer order mirrors the assembler: truth → timeline → graph → memory →
// recommendations → preferences.
// ============================================================================
import type { Sensitivity, Provenance } from "@/lib/memory-canonical/types";

export interface CtxMemory { fact: string; provenance: Provenance; sensitivity: Sensitivity; confidence: number }
export interface CtxTimeline { title: string; occurredAt: string }
export interface CtxRelationship { relationshipType: string; otherType: string; otherId: string }
export interface CtxRecommendation { title: string; why: string }

export interface AssembledContext {
  entityType: string;
  entityId: string;
  truthLine: string | null;         // one-line current-state summary
  truthSensitivity?: Sensitivity;   // sensitivity of the truth line (for broad-prompt gating)
  memory: CtxMemory[];
  orgPreferences: CtxMemory[];
  userPreferences: CtxMemory[];
  timeline: CtxTimeline[];
  relationships: CtxRelationship[];
  recommendations: CtxRecommendation[];
}

const SENS_RANK: Record<Sensitivity, number> = { normal: 0, internal: 1, confidential: 2, restricted: 3 };
const PROV_HE: Record<Provenance, string> = { explicit: "מפורש", derived: "מחושב", inferred: "משוער" };

function memLines(mem: CtxMemory[], forBroadPrompt: boolean): string[] {
  const cap = forBroadPrompt ? SENS_RANK.internal : SENS_RANK.restricted;
  return mem
    .filter((m) => SENS_RANK[m.sensitivity] <= cap && m.fact.trim())
    .map((m) => `• ${m.fact} (${PROV_HE[m.provenance]}, ביטחון ${m.confidence}%)`);
}

/**
 * Render the assembled context into a compact prompt block. `forBroadPrompt`
 * drops confidential/restricted memory (org-wide / cross-broker safety).
 * Returns "" when there's nothing safe to say. Deterministic.
 */
export function renderContextText(ctx: AssembledContext, opts: { forBroadPrompt?: boolean; maxTimeline?: number } = {}): string {
  const broad = opts.forBroadPrompt ?? false;
  const maxTl = opts.maxTimeline ?? 6;
  const parts: string[] = [];

  // The truth line can itself be confidential — gate it for broad prompts.
  const truthOk = !broad || SENS_RANK[ctx.truthSensitivity ?? "internal"] <= SENS_RANK.internal;
  if (ctx.truthLine && truthOk) parts.push(`מצב נוכחי: ${ctx.truthLine}`);

  const mem = memLines(ctx.memory, broad);
  if (mem.length) parts.push(["זיכרון על הישות:", ...mem].join("\n"));

  const prefs = [...memLines(ctx.userPreferences, broad), ...memLines(ctx.orgPreferences, broad)];
  if (prefs.length) parts.push(["העדפות:", ...prefs].join("\n"));

  if (ctx.relationships.length) {
    const rel = ctx.relationships.slice(0, 8).map((r) => `• ${r.relationshipType} → ${r.otherType} ${r.otherId}`);
    parts.push(["קשרים:", ...rel].join("\n"));
  }

  if (ctx.timeline.length) {
    const tl = ctx.timeline.slice(0, maxTl).map((t) => `• ${t.title}`);
    parts.push(["פעילות אחרונה:", ...tl].join("\n"));
  }

  if (ctx.recommendations.length) {
    const rec = ctx.recommendations.slice(0, 5).map((r) => `• ${r.title} — ${r.why}`);
    parts.push(["המלצות פעילות:", ...rec].join("\n"));
  }

  return parts.join("\n\n").trim();
}

/** True when the rendered context carries any usable signal. */
export function hasContextSignal(ctx: AssembledContext): boolean {
  return !!(ctx.truthLine || ctx.memory.length || ctx.orgPreferences.length || ctx.userPreferences.length ||
    ctx.timeline.length || ctx.relationships.length || ctx.recommendations.length);
}
