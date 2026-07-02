// ============================================================================
// ✅ Relationship Graph — self-tests (pure, offline). Phase 27.9. Part 10.
// Scenarios: strong / weak / conflicting / historical / no relationship and
// multiple relationship types — plus network analysis, discovery, Chief-of-Staff
// answers, decision influence and the executive dashboard.
// ============================================================================
import { buildGraph, type NodeSeed } from "./graph";
import { analyzeNetwork } from "./network";
import { relationsFromLinks, relationsFromAgents, type LinkRel } from "./discovery";
import { buildRelationshipAnswers } from "./chief-of-staff";
import { relationshipInfluences, applyInfluenceToDecisions } from "./decision-influence";
import { buildExecutiveGraph } from "./executive";
import type { RawRelation, EntityType } from "./types";

export interface RGCheck { name: string; pass: boolean; detail: string }
export interface RGSelfCheck { ok: boolean; total: number; passed: number; checks: RGCheck[] }

const NOW = Date.UTC(2026, 6, 2);
const DAY = 86400000;
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();
const rel = (from: string, to: string, fromType: EntityType, toType: EntityType, type: string, at: string | null, source: string): RawRelation =>
  ({ from, to, fromType, toType, type, at, source, evidence: `${type} ${from}->${to}` });

export function runSelfCheck(): RGSelfCheck {
  const checks: RGCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const seeds: NodeSeed[] = [
    { id: "O1", type: "office", name: "רי/מקס פסגה" }, { id: "O2", type: "office", name: "אנגלו סכסון" },
    { id: "O3", type: "office", name: "משרד ג" }, { id: "O4", type: "office", name: "משרד ד" }, { id: "O5", type: "office", name: "משרד ה" },
    { id: "B1", type: "broker", name: "דנה" }, { id: "B2", type: "broker", name: "יוסי" },
    { id: "B4", type: "broker", name: "רון" }, { id: "B5", type: "broker", name: "מיה" },
    { id: "D1", type: "lead", name: "ליד מנותק" },
  ];

  const relations: RawRelation[] = [
    // Strong verified: B1 works_at O1 ×4 across 2 sources, fresh.
    rel("B1", "O1", "broker", "office", "works_at", iso(2), "agent_record"),
    rel("B1", "O1", "broker", "office", "works_at", iso(4), "yad2"),
    rel("B1", "O1", "broker", "office", "works_at", iso(6), "yad2"),
    rel("B1", "O1", "broker", "office", "works_at", iso(8), "yad2"),
    // Weak: B2 works_at O1 ×1, old.
    rel("B2", "O1", "broker", "office", "works_at", iso(200), "yad2"),
    // Multiple types: collaboration + ownership + market.
    rel("B1", "B2", "broker", "broker", "collaborated", iso(5), "shared_listing"),
    rel("B1", "B2", "broker", "broker", "collaborated", iso(9), "shared_listing"),
    rel("O1", "L1", "office", "listing", "owns", iso(3), "yad2"),
    rel("L1", "city:רחובות", "listing", "market", "related_to", iso(3), "yad2"),
    // Historical: O1 competed_with O2 spanning a long duration.
    rel("O1", "O2", "office", "office", "competed_with", iso(300), "shared_city"),
    rel("O1", "O2", "office", "office", "competed_with", iso(10), "shared_city"),
    // Conflicting relationship type.
    rel("O2", "O3", "office", "office", "conflicts_with", iso(20), "audit"),
    // Hidden opportunity: B4,B5 both work at O4 and O5 (no O4-O5 edge).
    rel("B4", "O4", "broker", "office", "works_at", iso(5), "agent_record"),
    rel("B4", "O5", "broker", "office", "works_at", iso(5), "agent_record"),
    rel("B5", "O4", "broker", "office", "works_at", iso(5), "agent_record"),
    rel("B5", "O5", "broker", "office", "works_at", iso(5), "agent_record"),
  ];

  const graph = buildGraph(seeds, relations);
  const strong = graph.edges.find((e) => e.from === "B1" && e.to === "O1" && e.type === "works_at")!;
  const weak = graph.edges.find((e) => e.from === "B2" && e.to === "O1")!;
  const historical = graph.edges.find((e) => e.from === "O1" && e.to === "O2")!;
  const conflict = graph.edges.find((e) => e.type === "conflicts_with");

  // Strong relationship.
  add("strong high strength", strong.strength >= 60, `${strong.strength}`);
  add("strong verified", strong.verification === "verified", strong.verification);
  add("confidence ≤ strength", graph.edges.every((e) => e.confidence <= e.strength), "");
  // Weak relationship.
  add("weak low strength", weak.strength < 40, `${weak.strength}`);
  add("weak single_source", weak.verification === "single_source", weak.verification);
  add("strong > weak", strong.strength > weak.strength, `${strong.strength}>${weak.strength}`);
  // Conflicting relationship.
  add("conflict edge present", !!conflict && conflict.type === "conflicts_with", "");
  // Historical relationship.
  add("historical duration computed", (historical.durationDays ?? 0) > 200, `${historical.durationDays}`);
  add("historical occurrences merged", historical.occurrences === 2, `${historical.occurrences}`);
  // No relationship.
  add("disconnected node detected", graph.nodes.find((n) => n.id === "D1")?.degree === 0, "");
  // Multiple relationship types.
  add("multiple relation types", Object.keys(graph.counts.byType).length >= 4, Object.keys(graph.counts.byType).join(","));

  // Network analysis.
  const net = analyzeNetwork(graph);
  add("most connected broker = B1", net.mostConnectedBrokers[0]?.id === "B1", net.mostConnectedBrokers[0]?.id ?? "");
  add("influential office present", net.mostInfluentialOffices.some((o) => o.id === "O1"), "");
  add("strongest sorted desc", net.strongestRelationships.every((e, i) => i === 0 || net.strongestRelationships[i - 1].strength >= e.strength), "");
  add("weak relationships captured", net.weakRelationships.some((e) => e.from === "B2"), "");
  add("disconnected in analysis", net.disconnectedEntities.some((n) => n.id === "D1"), "");
  add("hidden opportunity O4↔O5", net.hiddenOpportunities.some((h) => (h.a === "O4" && h.b === "O5") || (h.a === "O5" && h.b === "O4")), "");
  add("network health 0..100", net.networkHealth >= 0 && net.networkHealth <= 100, `${net.networkHealth}`);

  // Discovery from raw evidence.
  const links: LinkRel[] = [
    { agentId: "B1", officeId: "O1", listingId: "L1", city: "רחובות", source: "yad2", at: iso(3) },
    { agentId: "B2", officeId: "O1", listingId: "L1", city: "רחובות", source: "madlan", at: iso(4) },
  ];
  const derived = relationsFromLinks(links);
  add("discovery: represents + owns", derived.some((r) => r.type === "represents") && derived.some((r) => r.type === "owns"), "");
  add("discovery: collaboration from shared listing", derived.some((r) => r.type === "collaborated"), "");
  add("discovery: agents → works_at", relationsFromAgents([{ id: "B1", officeId: "O1", city: "רחובות" }]).some((r) => r.type === "works_at"), "");
  add("discovery never invents (empty in→empty out)", relationsFromLinks([]).length === 0, "");

  // Chief of Staff answers.
  const answers = buildRelationshipAnswers(graph);
  add("CoS answers grounded", answers.length > 0 && answers[0].confidence > 0 && answers[0].evidence.length >= 0, "");
  add("CoS office-office statement", answers.some((a) => /מחליף|מתחרה/.test(a.statement)), "");

  // Decision influence.
  const infl = relationshipInfluences(graph);
  add("strong entity → increase", infl.some((i) => i.entityId === "O1" && i.direction === "increase" && i.delta > 0), "");
  const applied = applyInfluenceToDecisions([{ entityId: "O1", confidence: 60 }], infl);
  add("influence raises confidence + note", applied[0].adjustedConfidence >= 60 && applied[0].relationshipNote !== null, `${applied[0].adjustedConfidence}`);

  // Executive dashboard.
  const exec = buildExecutiveGraph(graph, net);
  add("executive most connected + strategic", exec.mostConnected.length > 0 && exec.strategicRelationships.length > 0, "");
  add("executive missing + growth + totals", exec.missingRelationships.length > 0 && exec.growthOpportunities.length > 0 && exec.totals.edges > 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
