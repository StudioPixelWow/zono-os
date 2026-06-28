// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — Unified Recommendation Pipeline.
// ----------------------------------------------------------------------------
// One pipeline instead of every module minting its own recommendation shape.
// Producers emit FabricRecommendations; this normalises, dedupes, ranks and
// (server side) also derives a few deterministic recommendations from a fully
// composed KnowledgeObject's metrics. Every recommendation is explainable
// (reasoning + evidence + confidence + dependencies + expiry). Pure core +
// thin server entrypoint. Reusable across the whole system.
// ============================================================================
import type { FabricRecommendation, RecommendationPriority, EntityRef, KnowledgeObject } from "./types";
import { clamp } from "./metrics";
import { entityKey } from "./types";

const PRIORITY_WEIGHT: Record<RecommendationPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function recId(r: Pick<FabricRecommendation, "category" | "title" | "affectedEntities">): string {
  return `${r.category}:${r.title}:${r.affectedEntities.map(entityKey).sort().join("+")}`;
}

/** Normalise a partial into a complete, id-stamped recommendation. */
export function normalizeRecommendation(input: Omit<FabricRecommendation, "id"> & { id?: string }): FabricRecommendation {
  const base = {
    category: input.category, priority: input.priority, title: input.title,
    confidence: clamp(input.confidence), affectedEntities: input.affectedEntities ?? [],
    reasoning: input.reasoning, evidence: input.evidence ?? [], suggestedActions: input.suggestedActions ?? [],
    dependencies: input.dependencies ?? [], expiresAt: input.expiresAt ?? null, source: input.source,
  };
  return { ...base, id: input.id ?? recId(base) };
}

/** Dedupe (by stable id, keep highest confidence) + rank by priority×confidence. */
export function rankRecommendations(recs: FabricRecommendation[]): FabricRecommendation[] {
  const byId = new Map<string, FabricRecommendation>();
  for (const r of recs) {
    const prev = byId.get(r.id);
    if (!prev || r.confidence > prev.confidence) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) =>
    PRIORITY_WEIGHT[b.priority] * b.confidence - PRIORITY_WEIGHT[a.priority] * a.confidence);
}

/**
 * Derive deterministic recommendations from a composed KnowledgeObject. Honest:
 * only fires when the underlying metric is actually present and actionable.
 * This is generic, cross-entity logic — engines keep their domain recs.
 */
export function deriveFromKnowledge(k: KnowledgeObject): FabricRecommendation[] {
  const out: FabricRecommendation[] = [];
  const e: EntityRef = k.ref;
  const m = k.metrics;
  if (typeof m.completeness === "number" && m.completeness < 60) {
    out.push(normalizeRecommendation({
      category: "operations", priority: m.completeness < 35 ? "high" : "medium",
      title: "השלמת נתונים חסרים", confidence: clamp(100 - m.completeness),
      affectedEntities: [e], reasoning: `שלמות הנתונים ${m.completeness}% — חוסר פוגע בדיוק כל מנוע ה-AI.`,
      evidence: [`שלמות ${m.completeness}%`], suggestedActions: ["השלם טלפון/אימייל/רישוי"], dependencies: [],
      expiresAt: null, source: "fabric-derived",
    }));
  }
  if (typeof m.growth === "number" && m.growth >= 70) {
    out.push(normalizeRecommendation({
      category: "growth", priority: "high", title: "מגמת צמיחה — נצל מומנטום",
      confidence: clamp(m.growth), affectedEntities: [e], reasoning: `מדד צמיחה ${m.growth}/100 — מומנטום חיובי.`,
      evidence: [`צמיחה ${m.growth}/100`], suggestedActions: ["הגבר נוכחות באזור", "פנה ליצירת בלעדיות"], dependencies: [],
      expiresAt: null, source: "fabric-derived",
    }));
  } else if (typeof m.growth === "number" && m.growth > 0 && m.growth <= 30) {
    out.push(normalizeRecommendation({
      category: "risk", priority: "medium", title: "האטה — בדוק סיבות",
      confidence: clamp(100 - m.growth), affectedEntities: [e], reasoning: `מדד צמיחה ${m.growth}/100 — מגמת האטה.`,
      evidence: [`צמיחה ${m.growth}/100`], suggestedActions: ["נתח ירידת מלאי", "בדוק תחרות באזור"], dependencies: [],
      expiresAt: null, source: "fabric-derived",
    }));
  }
  if (typeof m.competition === "number" && m.competition >= 75) {
    out.push(normalizeRecommendation({
      category: "competition", priority: "medium", title: "אזור תחרותי — בידול נדרש",
      confidence: clamp(m.competition), affectedEntities: [e], reasoning: `עצמת תחרות ${m.competition}/100.`,
      evidence: [`תחרות ${m.competition}/100`], suggestedActions: ["חדד הצעת ערך", "מקד שיווק"], dependencies: [],
      expiresAt: null, source: "fabric-derived",
    }));
  }
  return out;
}
