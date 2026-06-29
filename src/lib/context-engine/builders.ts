// ============================================================================
// 🧱 Context Builders — assemble ContextBlocks from EXISTING reads (pure).
// ----------------------------------------------------------------------------
// Each builder consumes the injected ContextSources (the only data door) and
// produces priority-ranked, evidence-bearing blocks. Nothing is computed or
// fabricated — values pass through from existing intelligence; absent data is
// reported in `missing` and simply omitted. No AI, deterministic.
// ============================================================================
import { priorityFor } from "./priorities";
import type {
  BuilderResult, ContextBlock, ContextRequest, ContextSources, ContextType,
  Evidence, SourceActionCenter, SourceLocation,
} from "./types";

function mkBlock(
  key: string, label: string, data: unknown, source: string,
  confidence: number | null, evidence: Evidence[], managerOnly = false,
): ContextBlock {
  return { key, label, priority: priorityFor(key), data, evidence, confidence, source, managerOnly };
}

// ── Sub-builders ────────────────────────────────────────────────────────────

function blocksFromActionCenter(ac: SourceActionCenter): { blocks: ContextBlock[]; repositories: string[] } {
  const blocks: ContextBlock[] = [];
  const repositories = ["recommendations.service", "intelligence-explorer.dashboard"];

  if (ac.recommendations.length) {
    blocks.push(mkBlock(
      "aiCoach", "AI Coach — המלצות קיימות",
      ac.recommendations.slice(0, 10),
      "recommendations.service", null,
      [{ source: "recommendations.service", detail: `${ac.recommendations.length} recommendations` }],
    ));
  }
  blocks.push(mkBlock(
    "market", "מודיעין שוק",
    { priceDrops: ac.priceDrops, totalListings: ac.totalListings, newListings: ac.newListings.slice(0, 8) },
    "intelligence-explorer.dashboard", null,
    [{ source: "external-listings.repository", detail: `${ac.totalListings} listings · ${ac.priceDrops} price drops` }],
  ));
  if (ac.opportunities.length) {
    blocks.push(mkBlock(
      "propertyRadar", "הזדמנויות שוק",
      ac.opportunities.slice(0, 8), "intelligence-explorer.dashboard", null,
      [{ source: "external-listings.repository", detail: `${ac.opportunities.length} opportunities` }],
    ));
  }
  if (ac.brokers.length) {
    blocks.push(mkBlock(
      "brokerIntelligence", "מודיעין סוכנים",
      ac.brokers.slice(0, 8), "broker.repository", null,
      [{ source: "broker_profiles", detail: `${ac.brokers.length} brokers` }],
    ));
  }
  if (ac.offices.length) {
    blocks.push(mkBlock(
      "officeIntelligence", "מודיעין משרדים",
      ac.offices.slice(0, 8), "agency-intelligence.api", null,
      [{ source: "agency_scores", detail: `${ac.offices.length} offices` }], true,
    ));
    const byThreat = [...ac.offices].filter((o) => o.threat != null).sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0)).slice(0, 5);
    if (byThreat.length) {
      blocks.push(mkBlock(
        "competition", "תחרות",
        byThreat, "agency-intelligence.api", null,
        [{ source: "agency_scores", detail: "threat-ranked offices" }], true,
      ));
    }
  }
  return { blocks, repositories };
}

function blocksFromLocation(loc: SourceLocation): { blocks: ContextBlock[]; repositories: string[]; missing: string[] } {
  const blocks: ContextBlock[] = [];
  const missing: string[] = [];
  const repositories = ["agency-intelligence.api", "external-listings.repository"];
  const t = loc.territory;

  if (t) {
    blocks.push(mkBlock(
      "neighborhoodIntelligence", "מודיעין שכונה",
      { city: t.city, neighborhood: t.neighborhood, leaderOffice: t.leaderOfficeName, dominance: t.dominance, competitionLevel: t.competitionLevel },
      "agency-intelligence.api", t.confidence,
      [{ source: "agency_territory_stats", detail: `leader: ${t.leaderOfficeName ?? "—"}`, confidence: t.confidence }],
    ));
    blocks.push(mkBlock(
      "marketAcceptance", "קליטת שוק / תחרות אזורית",
      { competitionLevel: t.competitionLevel, dominance: t.dominance },
      "agency-intelligence.api", t.confidence,
      [{ source: "agency_territory_stats", detail: `competition: ${t.competitionLevel ?? "—"}`, confidence: t.confidence }],
    ));
    if (t.missing.length) missing.push(...t.missing.map((m) => `territory:${m}`));
  } else {
    missing.push("territory");
  }

  if (loc.opportunities.length) {
    blocks.push(mkBlock(
      "nearbyOpportunities", "הזדמנויות סמוכות",
      loc.opportunities.slice(0, 6), "external-listings.repository", null,
      [{ source: "external_listings", detail: `${loc.counts.opportunities} opportunities nearby` }],
    ));
  }
  if (loc.newListings.length) {
    blocks.push(mkBlock(
      "nearbyListings", "מודעות אחרונות באזור",
      { recent: loc.newListings.slice(0, 6), counts: loc.counts },
      "external-listings.repository", null,
      [{ source: "external_listings", detail: `${loc.counts.recent} recent · ${loc.counts.total} total` }],
    ));
  }
  return { blocks, repositories, missing };
}

function currentEntityBlock(req: ContextRequest): ContextBlock | null {
  if (!req.entityId) return null;
  return mkBlock(
    "currentEntity", "הישות הנוכחית",
    { type: req.type, id: req.entityId, screen: req.screen ?? null, workflow: req.workflow ?? null },
    "request", null,
    [{ source: "request", detail: `current ${req.type}: ${req.entityId}` }],
  );
}

// ── Per-type composition ─────────────────────────────────────────────────────

const ENTITY_TYPES: ReadonlySet<ContextType> = new Set([
  "property", "lead", "seller", "buyer", "deal", "task", "journey", "calendar", "communication", "valuation",
]);

async function buildGeneric(s: ContextSources, req: ContextRequest): Promise<BuilderResult> {
  const blocks: ContextBlock[] = [];
  const repositories: string[] = [];
  const missing: string[] = [];

  const ce = currentEntityBlock(req);
  if (ce) { blocks.push(ce); repositories.push("request"); }

  // Market-/office-/broker-wide context comes from the Action Center read.
  const wantsMarketWide = ["organization", "office", "broker", "market", "action-center", "mission-control"].includes(req.type);
  if (wantsMarketWide) {
    const ac = await s.actionCenter();
    if (ac) { const r = blocksFromActionCenter(ac); blocks.push(...r.blocks); repositories.push(...r.repositories); }
    else missing.push("action-center");
  }

  // Location-scoped context (territory + nearby listings) when we have a place,
  // or for explicitly location/entity types.
  if (req.city || req.neighborhood || req.type === "neighborhood" || ENTITY_TYPES.has(req.type)) {
    if (req.city || req.neighborhood) {
      const loc = await s.location(req.city ?? null, req.neighborhood ?? null);
      if (loc) { const r = blocksFromLocation(loc); blocks.push(...r.blocks); repositories.push(...r.repositories); missing.push(...r.missing); }
      else missing.push("location");
    } else {
      missing.push("location:no-city-or-neighborhood");
    }
  }

  // Entity-specific deep records (CRM rows, timeline, tasks) are surfaced by
  // dedicated repositories wired in later phases — declared missing for now so
  // nothing is fabricated.
  if (ENTITY_TYPES.has(req.type)) {
    missing.push(`${req.type}:entity-detail`, `${req.type}:timeline`, `${req.type}:tasks`, `${req.type}:recent-activity`);
  }

  return { blocks, missing, repositories };
}

/** Every supported type uses the same deterministic composition. */
export async function runBuilder(type: ContextType, s: ContextSources, req: ContextRequest): Promise<BuilderResult> {
  return buildGeneric(s, { ...req, type });
}

export const SUPPORTED_CONTEXT_TYPES: ContextType[] = [
  "organization", "office", "broker", "property", "lead", "seller", "buyer", "deal",
  "task", "journey", "neighborhood", "market", "valuation", "action-center",
  "mission-control", "communication", "calendar",
];
