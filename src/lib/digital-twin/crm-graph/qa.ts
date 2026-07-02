// ============================================================================
// ✅ CRM Relationship Graph Integration — self-tests (pure, offline). 28.4.
// Scenarios: lead→buyer conversion path, seller with property + valuation,
// buyer linked to property, mission linked to a CRM entity, duplicate lead
// relationship — built through the reused Universal Relationship Graph.
// ============================================================================
import { buildGraph, analyzeNetwork, type NodeSeed } from "@/lib/relationship-graph";
import { relationsFromCrm, type CrmInputs } from "./discovery";
import { buildCrmDashboard } from "./dashboard";

export interface CGCheck { name: string; pass: boolean; detail: string }
export interface CGSelfCheck { ok: boolean; total: number; passed: number; checks: CGCheck[] }

const NOW = new Date("2026-07-02T00:00:00Z").toISOString();

export function runSelfCheck(): CGSelfCheck {
  const checks: CGCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const inputs: CrmInputs = {
    leads: [
      { id: "LD1", name: "אבי", convertedBuyerId: "B1", convertedSellerId: null, propertyId: null, ownerId: "U1", at: NOW },
      { id: "LD2", name: "דנה", convertedBuyerId: null, convertedSellerId: "S1", propertyId: null, ownerId: "U1", at: NOW },
      { id: "LD3", name: "כפול-א", convertedBuyerId: null, convertedSellerId: null, propertyId: null, ownerId: "U2", at: NOW },
      { id: "LD4", name: "כפול-ב", convertedBuyerId: null, convertedSellerId: null, propertyId: null, ownerId: "U2", at: NOW },
    ],
    buyers: [{ id: "B1", name: "אבי קונה", ownerId: "U1", matches: [{ propertyId: "P1", score: 88, at: NOW }, { propertyId: "P2", score: 55, at: NOW }], at: NOW }],
    sellers: [{ id: "S1", name: "דנה מוכרת", ownerId: "U1", propertyId: "P3", valuationId: "V1", at: NOW }],
    missions: [{ id: "M1", entityType: "buyer", entityId: "B1", at: NOW }],
    activities: [{ id: "A1", entityType: "buyer", entityId: "B1", kind: "call", at: NOW }],
    duplicates: [{ a: "LD3", b: "LD4" }],
  };

  const relations = relationsFromCrm(inputs);
  const seeds: NodeSeed[] = [
    { id: "LD1", type: "lead", name: "אבי" }, { id: "LD2", type: "lead", name: "דנה" },
    { id: "LD3", type: "lead", name: "כפול-א" }, { id: "LD4", type: "lead", name: "כפול-ב" },
    { id: "B1", type: "buyer", name: "אבי קונה" }, { id: "S1", type: "seller", name: "דנה מוכרת" },
    { id: "P1", type: "property", name: "נכס 1" }, { id: "P2", type: "property", name: "נכס 2" }, { id: "P3", type: "property", name: "נכס 3" },
    { id: "V1", type: "valuation", name: "הערכה" }, { id: "broker:U1", type: "broker", name: "מתווך 1" }, { id: "broker:U2", type: "broker", name: "מתווך 2" },
    { id: "M1", type: "mission", name: "משימה" }, { id: "A1", type: "activity", name: "פעילות" },
    { id: "LEAD_ORPHAN", type: "lead", name: "יתום" },
  ];
  const graph = buildGraph(seeds, relations);
  const network = analyzeNetwork(graph);
  const dash = buildCrmDashboard(graph, network);

  // Edges present.
  add("lead→buyer converted edge", graph.edges.some((e) => e.from === "LD1" && e.to === "B1" && e.type === "converted_to"), "");
  add("lead→seller converted edge", graph.edges.some((e) => e.from === "LD2" && e.to === "S1" && e.type === "converted_to"), "");
  add("buyer→property interested edge", graph.edges.some((e) => e.from === "B1" && e.to === "P1" && e.type === "interested_in"), "");
  add("seller→property owns edge", graph.edges.some((e) => e.from === "S1" && e.to === "P3" && e.type === "owns"), "");
  add("seller→valuation edge", graph.edges.some((e) => e.from === "S1" && e.to === "valuation:V1" && e.type === "valued_by"), "");
  add("entity→broker managed_by", graph.edges.some((e) => e.from === "B1" && e.to === "broker:U1" && e.type === "managed_by"), "");
  add("entity→mission assigned_to", graph.edges.some((e) => e.from === "B1" && e.to === "M1" && e.type === "assigned_to"), "");
  add("entity→activity logged", graph.edges.some((e) => e.from === "B1" && e.to === "A1" && e.type === "logged"), "");
  add("duplicate lead edge", graph.edges.some((e) => e.type === "duplicate_of" && ((e.from === "LD3" && e.to === "LD4") || (e.from === "LD4" && e.to === "LD3"))), "");

  // Strong match ranks above weak (score 88 emits more evidence than 55).
  const b1p1 = graph.edges.find((e) => e.from === "B1" && e.to === "P1");
  const b1p2 = graph.edges.find((e) => e.from === "B1" && e.to === "P2");
  add("stronger match higher strength", (b1p1?.strength ?? 0) > (b1p2?.strength ?? 0), `${b1p1?.strength} vs ${b1p2?.strength}`);

  // Dashboard.
  add("dashboard buyer/property matches", dash.strongestBuyerPropertyMatches.some((m) => m.to === "P1"), "");
  add("dashboard seller/property links", dash.sellerPropertyLinks.some((m) => m.from === "S1"), "");
  add("dashboard seller/valuation links", dash.sellerValuationLinks.length >= 1, "");
  add("dashboard duplicates", dash.totals.duplicates >= 1, `${dash.totals.duplicates}`);
  add("conversion path lead→buyer→property", dash.conversionPaths.some((p) => p.lead === "אבי" && p.steps.length >= 2), JSON.stringify(dash.conversionPaths[0]?.steps ?? []));
  add("broker ownership computed", dash.brokerOwnership.some((b) => b.count >= 2), "");
  add("relationship gap detects orphan", dash.relationshipGaps.some((gp) => gp.id === "LEAD_ORPHAN"), "");
  add("CoS statements grounded", dash.chiefOfStaffStatements.length >= 2 && dash.chiefOfStaffStatements.some((s2) => /הומרו/.test(s2)), "");

  // Empty input → no edges, honest.
  const empty = buildCrmDashboard(buildGraph([], relationsFromCrm({ leads: [], buyers: [], sellers: [], missions: [], activities: [], duplicates: [] })), analyzeNetwork(buildGraph([], [])));
  add("empty → no conversions + note", empty.totals.conversions === 0 && empty.chiefOfStaffStatements.length > 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
