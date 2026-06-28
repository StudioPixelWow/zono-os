// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — Unified Search Context (server-only).
// ----------------------------------------------------------------------------
// THE entrypoint for future AI agents. They ask the Fabric — never individual
// modules, never raw tables. A small deterministic intent router maps natural
// questions to composed knowledge/context/timeline reads and returns an
// explainable FabricAnswer. Also exposes the server-side recommendation
// aggregation (producer recs + Fabric-derived recs, ranked).
// ============================================================================
import "server-only";
import type { EntityRef, FabricAnswer, FabricRecommendation } from "./types";
import { getKnowledge } from "./knowledge";
import { ensureProvidersRegistered } from "./providers";
import { gather } from "./registry";
import { getEntityTimeline } from "./timeline";
import { assembleContext } from "./context";
import { deriveFromKnowledge, rankRecommendations } from "./recommendation";
import { buildFabricExplanation } from "./explain";
import { composeConfidence } from "./confidence";
import { evolutionRepository } from "@/lib/brokerage-data/evolution/repository";

/** All recommendations for an entity: producer-emitted + Fabric-derived, ranked. */
export async function getEntityRecommendations(ref: EntityRef): Promise<FabricRecommendation[]> {
  ensureProvidersRegistered();
  const [contributions, knowledge] = await Promise.all([gather(ref), getKnowledge(ref)]);
  const fromProducers = contributions.flatMap((c) => c.contribution.recommendations ?? []);
  const derived = deriveFromKnowledge(knowledge);
  return rankRecommendations([...fromProducers, ...derived]);
}

// ── Concrete, deterministic answers (each reused by the router) ─────────────
export async function whoDominatesNeighborhood(city: string, neighborhood: string): Promise<FabricAnswer> {
  const rows = await evolutionRepository.neighborhoodLeaders(200);
  const row = rows.find((r) => r.neighborhood === neighborhood && (!city || r.city === city));
  const related: EntityRef[] = row?.competitionLevel ? [{ type: "neighborhood", id: `${city}|${neighborhood}`, city }] : [];
  return {
    question: `מי מוביל בשכונה ${neighborhood}?`,
    answer: row ? { neighborhood: row.neighborhood, city: row.city, leaderShare: row.marketShare, competition: row.competitionLevel, listings: row.listingVolume } : null,
    explanation: row ? buildFabricExplanation({
      scoreType: "market_opportunity", score: row.marketShare, entity: { type: "neighborhood", id: `${city}|${neighborhood}`, city },
      reasons: [`נתח מוביל ${row.marketShare}%`, `${row.listingVolume} מודעות`, `ריכוזיות ${Math.round(row.concentration * 100)}%`],
      confidence: composeConfidence([{ source: "Neighborhood Dominance", value: row.confidence, weight: 1, sampleSize: row.listingVolume }]),
      sources: ["ZONO Evolution — Neighborhood Dominance"], reasoning: `נתח מוביל ${row.marketShare}% מתוך ${row.listingVolume} מודעות.`,
    }) : null,
    relatedEntities: related, producers: ["brokerage-market"],
  };
}

export async function fastestGrowingOffice(): Promise<FabricAnswer> {
  const { rising } = await evolutionRepository.growthLeaders("office");
  const top = rising[0] ?? null;
  return {
    question: "איזה משרד צומח הכי מהר?",
    answer: top ? { office: top.label, city: top.city, growthPct: top.deltaPct, from: top.prev, to: top.curr } : null,
    explanation: top ? buildFabricExplanation({
      scoreType: "opportunity", score: Math.min(100, Math.max(0, 50 + top.deltaPct / 2)), entity: { type: "office", id: top.key, city: top.city },
      reasons: [`צמיחה +${top.deltaPct}%`, `${top.prev}→${top.curr} מודעות`],
      confidence: composeConfidence([{ source: "Growth leaders", value: 70, weight: 1, sampleSize: 2 }]),
      sources: ["ZONO Evolution — Growth Leaders"], reasoning: `צמיחה של +${top.deltaPct}% בין שני התצלומים האחרונים.`,
    }) : null,
    relatedEntities: top ? [{ type: "office", id: top.key, city: top.city, label: top.label }] : [],
    producers: ["brokerage-evolution"],
  };
}

export async function relationshipsAround(ref: EntityRef): Promise<FabricAnswer> {
  const k = await getKnowledge(ref);
  return {
    question: `קשרים סביב ${ref.label ?? ref.id}`,
    answer: { count: k.relationships.length, edges: k.relationships.slice(0, 20) },
    explanation: k.explanation, relatedEntities: k.relationships.slice(0, 10).map((e) => e.to), producers: k.producers,
  };
}

export async function marketActivity(city: string, limit = 30): Promise<FabricAnswer> {
  const ref: EntityRef = { type: "market", id: city, city };
  const timeline = await getEntityTimeline(ref, limit);
  return {
    question: `מה קרה בשוק ${city} לאחרונה?`,
    answer: { city, events: timeline.length, timeline }, explanation: null,
    relatedEntities: [ref], producers: ["brokerage-market", "fabric-bus"],
  };
}

// ── Natural-language router (deterministic keyword routing) ─────────────────
export async function askFabric(question: string, hints?: { ref?: EntityRef; city?: string; neighborhood?: string }): Promise<FabricAnswer> {
  ensureProvidersRegistered();
  const q = question.trim();
  const low = q.toLowerCase();

  if (/(מוביל|שולט|דומיננט|dominates|leader).*(שכונ|neighborhood)/i.test(q) && (hints?.neighborhood || hints?.city)) {
    return whoDominatesNeighborhood(hints.city ?? "", hints.neighborhood ?? hints.city ?? "");
  }
  if (/(צומח|גדל|fastest|grow).*(משרד|office)/i.test(q)) return fastestGrowingOffice();
  if (/(קשר|קשרים|connected|relationship)/i.test(low) && hints?.ref) return relationshipsAround(hints.ref);
  if (/(שוק|market).*(קרה|happened|30|חודש|recent)/i.test(q) && hints?.city) return marketActivity(hints.city);
  if (hints?.ref) {
    const ctx = await assembleContext(hints.ref);
    return { question: q, answer: { root: ctx.root.ref, related: ctx.related.map((r) => r.ref), confidence: ctx.confidence.value }, explanation: ctx.root.explanation, relatedEntities: ctx.related.map((r) => r.ref), producers: ctx.producers };
  }
  return { question: q, answer: null, explanation: null, relatedEntities: [], producers: [] };
}
