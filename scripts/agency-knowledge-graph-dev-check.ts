/**
 * LOCAL-DEV-ONLY check for the Agency Knowledge Graph (Phase 26.3). Pure layers
 * only (no DB, no network). Verifies: relationship key stability · dedup ·
 * idempotent merge (max confidence + merged evidence) · area footprint
 * aggregation · timeline event detection · signal detection.
 *
 * Run: npx tsx scripts/agency-knowledge-graph-dev-check.ts
 */
import {
  relationshipKey, dedupeRelationshipInputs, mergeRelationship,
  computeAreaFootprint, detectTimelineEvents, detectSignals,
  ACTIVITY_SPIKE_THRESHOLD,
} from "../src/lib/agencies/graph/agencyGraphTypes";
import type { AgencyEntityRelationship, RelationshipInput } from "../src/lib/agencies/graph/agencyGraphTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const NOW = "2026-06-26T00:00:00.000Z";
const EARLIER = "2026-01-01T00:00:00.000Z";

function rel(p: Partial<AgencyEntityRelationship> & Pick<AgencyEntityRelationship, "entityType" | "entityId" | "relationshipType">): AgencyEntityRelationship {
  return {
    id: `${p.entityType}-${p.entityId}-${p.relationshipType}`,
    organizationId: "org1", agencyId: "ag1",
    entityType: p.entityType, entityId: p.entityId, relationshipType: p.relationshipType,
    confidence: p.confidence ?? 0.6, source: p.source ?? "internal", evidence: p.evidence ?? {},
    firstDetectedAt: p.firstDetectedAt ?? NOW, lastSeenAt: p.lastSeenAt ?? NOW,
    active: p.active ?? true, createdAt: NOW, updatedAt: NOW,
  };
}

function main(): void {
  console.log("Agency Knowledge Graph dev-check\n");

  // 1) Relationship key stability.
  console.log("Relationship key:");
  const base: RelationshipInput = { agencyId: "ag1", entityType: "property", entityId: "p1", relationshipType: "property_listing" };
  const baseWithConfidence: RelationshipInput = { ...base, confidence: 0.9 };
  assert(relationshipKey(base) === relationshipKey(baseWithConfidence), "key ignores confidence (stable identity)");
  assert(relationshipKey(base) !== relationshipKey({ ...base, relationshipType: "property_sold" }), "different relationship_type → different key");

  // 2) Dedup of relationship inputs (duplicate prevention).
  console.log("\nDedup / duplicate prevention:");
  const deduped = dedupeRelationshipInputs([
    { ...base, confidence: 0.5, evidence: { a: 1 } },
    { ...base, confidence: 0.8, evidence: { b: 2 } },
    { agencyId: "ag1", entityType: "agent", entityId: "u1", relationshipType: "agent_member", confidence: 0.9 },
  ]);
  assert(deduped.length === 2, "duplicate edges collapsed to one (2 unique of 3)");
  const merged = deduped.find((d) => d.entityId === "p1")!;
  assert(merged.confidence === 0.8, "dedup keeps the higher confidence");
  assert((merged.evidence as Record<string, number>).a === 1 && (merged.evidence as Record<string, number>).b === 2, "dedup merges evidence from both");

  // 3) Idempotent merge (update path).
  console.log("\nIdempotent merge / update:");
  const existing = { confidence: 0.7, evidence: { firstRun: true } };
  const m1 = mergeRelationship(existing, { ...base, confidence: 0.4, evidence: { secondRun: true } }, NOW);
  assert(m1.confidence === 0.7, "merge keeps max confidence (0.7 vs 0.4)");
  assert((m1.evidence as Record<string, boolean>).firstRun && (m1.evidence as Record<string, boolean>).secondRun, "merge unions evidence");
  assert(m1.active === true && m1.lastSeenAt === NOW, "merge re-activates + advances last_seen");
  const m2 = mergeRelationship(null, { ...base, confidence: 0.55 }, NOW);
  assert(m2.confidence === 0.55, "merge of new relationship uses incoming confidence");

  // 4) Agent → agency graph + property → agency graph shape.
  console.log("\nGraph shape (agents + properties):");
  const graph = [
    rel({ entityType: "agent", entityId: "u1", relationshipType: "agent_member", confidence: 0.9 }),
    rel({ entityType: "property", entityId: "p1", relationshipType: "property_listing" }),
    rel({ entityType: "property", entityId: "p2", relationshipType: "property_sold" }),
  ];
  assert(graph.filter((r) => r.relationshipType === "agent_member").length === 1, "agent_member edge present");
  assert(graph.filter((r) => r.entityType === "property").length === 2, "property edges present (listing + sold)");

  // 5) Area footprint calculation.
  console.log("\nArea footprint:");
  const fp = computeAreaFootprint([
    rel({ entityType: "city", entityId: "tel aviv", relationshipType: "area_activity", confidence: 0.7, evidence: { label: "תל אביב" }, firstDetectedAt: EARLIER }),
    rel({ entityType: "neighborhood", entityId: "florentin", relationshipType: "area_activity", confidence: 0.6, evidence: { label: "פלורנטין" } }),
    rel({ entityType: "street", entityId: "herzl", relationshipType: "area_activity", confidence: 0.5, evidence: { label: "הרצל" } }),
    rel({ entityType: "property", entityId: "p1", relationshipType: "property_listing" }),
    rel({ entityType: "property", entityId: "p2", relationshipType: "property_sold" }),
    rel({ entityType: "deal", entityId: "d1", relationshipType: "deal_participant" }),
    rel({ entityType: "city", entityId: "old", relationshipType: "area_activity", active: false, evidence: { label: "ignored" } }),
  ]);
  assert(fp.cities.length === 1 && fp.cities[0] === "תל אביב", "footprint uses evidence label + ignores inactive city");
  assert(fp.neighborhoods.includes("פלורנטין") && fp.streets.includes("הרצל"), "neighborhood + street captured");
  assert(fp.activePropertiesCount === 1 && fp.historicalPropertiesCount === 1, "active vs historical property counts");
  assert(fp.dealCount === 1, "deal count");
  assert(fp.firstSeen === EARLIER, "footprint firstSeen = earliest firstDetectedAt");
  assert(fp.confidence > 0.55 && fp.confidence < 0.65, "footprint confidence = avg of area confidences");

  // 6) Timeline event detection (before → after).
  console.log("\nTimeline events:");
  const before = [rel({ entityType: "city", entityId: "tel aviv", relationshipType: "area_activity", evidence: { label: "תל אביב" } })];
  const after = [
    ...before,
    rel({ entityType: "city", entityId: "haifa", relationshipType: "area_activity", evidence: { label: "חיפה" } }),
    rel({ entityType: "neighborhood", entityId: "carmel", relationshipType: "area_activity", evidence: { label: "כרמל" } }),
    rel({ entityType: "project", entityId: "prj1", relationshipType: "project_marketer", evidence: { label: "מגדלי הים" } }),
    rel({ entityType: "property", entityId: "p1", relationshipType: "property_listing" }),
  ];
  const events = detectTimelineEvents(before, after);
  assert(events.some((e) => e.eventType === "area_entered_city"), "new-city event detected");
  assert(events.some((e) => e.eventType === "area_entered_neighborhood"), "new-neighborhood event detected");
  assert(events.some((e) => e.eventType === "project_connected"), "project-connected event detected");
  assert(events.some((e) => e.eventType === "first_area_property"), "first-property event detected");
  assert(detectTimelineEvents(after, after).length === 0, "no events when nothing changed (no noise)");

  // 7) Signal detection.
  console.log("\nSignals:");
  const sigs = detectSignals(before, after);
  assert(sigs.some((s) => s.signalType === "new_area_detected"), "new_area_detected signal");
  assert(sigs.some((s) => s.signalType === "project_connection_detected"), "project_connection_detected signal");
  assert(detectSignals(after, after).length === 0, "no signals when nothing changed");

  // Activity spike.
  const spikeBefore: AgencyEntityRelationship[] = [];
  const spikeAfter = Array.from({ length: ACTIVITY_SPIKE_THRESHOLD + 1 }, (_, i) =>
    rel({ entityType: "property", entityId: `p${i}`, relationshipType: "property_listing" }));
  assert(detectSignals(spikeBefore, spikeAfter).some((s) => s.signalType === "agency_activity_spike"), "activity-spike signal at threshold");

  // Agent network expansion.
  const agentsBefore = [rel({ entityType: "agent", entityId: "u1", relationshipType: "agent_member" })];
  const agentsAfter = [
    ...agentsBefore,
    rel({ entityType: "agent", entityId: "u2", relationshipType: "agent_member" }),
    rel({ entityType: "agent", entityId: "u3", relationshipType: "agent_member" }),
  ];
  assert(detectSignals(agentsBefore, agentsAfter).some((s) => s.signalType === "agent_network_expanded"), "agent-network-expanded signal (+2)");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY KNOWLEDGE GRAPH CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
