// ============================================================================
// ✅ Lead Intelligence Agent — self-tests (pure, offline). 29.6. Part 12.
// Scenarios: new / hot-buyer / hot-seller / both / duplicate / cold / no-contact
// / stale / investor / property-specific / unknown / converted — plus the agent
// emitting recommendation + mission proposals (nothing auto-executes).
// ============================================================================
import { buildLeadScorecard } from "./scorecard";
import { leadAgent } from "./agent";
import type { LeadSignals, LeadIntent } from "./types";

export interface LACheck { name: string; pass: boolean; detail: string }
export interface LASelfCheck { ok: boolean; total: number; passed: number; checks: LACheck[] }

const sig = (over: Partial<LeadSignals> = {}): LeadSignals => ({
  id: "LD1", name: "רון ליד",
  source: "website", sourceQuality: 60, leadQuality: 60, intent: "buyer" as LeadIntent, intentConfidence: 70, buyerSellerFit: "קונה",
  urgency: 55, conversionProbability: 60, duplicateRisk: 5, contactRisk: 20, communicationHealth: 60, completeness: 70, stage: "qualified", nextBestAction: "המר לקונה", message: "מחפש דירה לקנות",
  relationshipPath: [], behavior: { calls: 1, messages: 2, emails: 0, meetings: 0, visits: 0, statusChanges: 0, followUps: 1 },
  healthScore: 62, healthLabel: "יציב", recencyScore: 75, engagementScore: 50, totalActivities: 4, lastActivityAt: "2026-06-30T00:00:00Z",
  relationshipDegree: 1, brokerConnections: [], classification: ["ליד קונה"], learnings: [],
  lifecycleRoles: ["lead"], existingCustomer: false, repeatClient: false, formerBuyer: false, formerSeller: false, investor: false, multiRole: false, lifecycleStage: "new_lead",
  hasConvertedBuyer: false, hasConvertedSeller: false, hasProperty: false, truthScore: 60, ...over,
});

export function runSelfCheck(): LASelfCheck {
  const checks: LACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const card = (o: Partial<LeadSignals>) => buildLeadScorecard(sig(o));
  const hasRisk = (c: ReturnType<typeof card>, t: string) => c.risks.some((r) => r.type === t);
  const hasOpp = (c: ReturnType<typeof card>, t: string) => c.opportunities.some((o) => o.type === t);

  const base = card({});
  add("scorecard full model", typeof base.health.leadHealth === "number" && !!base.strategy.recommendedStrategy && !!base.intent.intent && !!base.routing.target && base.aiRecommendation.length > 0, "");
  add("health has 11 metrics", ["leadHealth", "leadQuality", "intentConfidence", "conversionProbability", "urgency", "contactability", "duplicateRisk", "communicationHealth", "relationshipStrength", "dataCompleteness", "decisionConfidence"].every((k) => typeof (base.health as unknown as Record<string, number>)[k] === "number"), "");

  // New lead.
  const fresh = card({ totalActivities: 0, lastActivityAt: null, stage: "new", intentConfidence: 30, intent: "unknown" });
  add("new lead → health 'חדש' + contact/qualify", fresh.health.label === "חדש" && ["CONTACT_NOW", "QUALIFY", "COLLECT_INFORMATION"].includes(fresh.strategy.recommendedStrategy), fresh.strategy.recommendedStrategy);

  // Hot buyer lead.
  const hotBuyer = card({ intent: "buyer", intentConfidence: 80, conversionProbability: 80, stage: "qualified", classification: ["ליד חם", "ליד קונה"] });
  add("hot buyer → convert-buyer + routing buyer", hotBuyer.strategy.recommendedStrategy === "CONVERT_TO_BUYER" && hotBuyer.routing.target === "buyer" && hasOpp(hotBuyer, "hot_lead"), hotBuyer.strategy.recommendedStrategy);
  add("convert requires approval", hotBuyer.strategy.requiredApprovals.includes("מתווך"), "");

  // Hot seller lead.
  const hotSeller = card({ intent: "seller", buyerSellerFit: "מוכר", intentConfidence: 80, stage: "qualified", classification: ["ליד מוכר"] });
  add("hot seller → convert-seller + routing seller", hotSeller.strategy.recommendedStrategy === "CONVERT_TO_SELLER" && hotSeller.routing.target === "seller", hotSeller.strategy.recommendedStrategy);

  // Both intent.
  const both = card({ intent: "both", buyerSellerFit: "קונה+מוכר", intentConfidence: 80, stage: "qualified" });
  add("both intent → convert-both + routing both + opp", both.strategy.recommendedStrategy === "CONVERT_TO_BOTH" && both.routing.target === "both" && hasOpp(both, "both_sides_opportunity"), both.routing.target);

  // Duplicate lead.
  const dup = card({ duplicateRisk: 85 });
  add("duplicate → DEDUPLICATE + risk + duplicate_review routing", dup.strategy.recommendedStrategy === "DEDUPLICATE" && hasRisk(dup, "duplicate_lead") && dup.routing.target === "duplicate_review", dup.routing.target);

  // Cold lead.
  const cold = card({ conversionProbability: 20, classification: ["ליד קר"], stage: "nurturing" });
  add("cold → nurture + routing nurture", cold.strategy.recommendedStrategy === "LONG_TERM_NURTURE" && cold.routing.target === "nurture" && hasRisk(cold, "cold_lead"), cold.routing.target);

  // No contact info.
  const noContact = card({ contactRisk: 90, completeness: 30 });
  add("no contact → collect info + risk", noContact.strategy.recommendedStrategy === "COLLECT_INFORMATION" && hasRisk(noContact, "low_contactability"), noContact.strategy.recommendedStrategy);

  // Stale lead.
  const stale = card({ recencyScore: 5 });
  add("stale lead → stale risk", hasRisk(stale, "stale_lead"), "");

  // Investor lead.
  const investor = card({ intent: "investor", investor: true, buyerSellerFit: "משקיע" });
  add("investor → investor opportunity", hasOpp(investor, "investor_opportunity"), "");

  // Property-specific lead.
  const propLead = card({ hasProperty: true, relationshipPath: ["נכס P1"] });
  add("property-specific opportunity", hasOpp(propLead, "property_specific"), "");

  // Unknown intent.
  const unknown = card({ intent: "unknown", intentConfidence: 20, message: null, stage: "contacted" });
  add("unknown intent → human_review routing + risk", unknown.routing.target === "human_review" && hasRisk(unknown, "unclear_intent"), unknown.routing.target);

  // Converted lead → intent strengthened + succeeded.
  const converted = card({ hasConvertedBuyer: true, hasConvertedSeller: true, stage: "converted" });
  add("converted → intent both + strategy succeeded", converted.intent.intent === "both" && converted.strategy.change.signal === "succeeded", converted.strategy.change.signal);

  // Playbook + meta.
  add("playbook ordered + mission mapped", base.strategy.playbook.every((a, i) => a.order === i + 1 && !!a.missionType), "");
  add("routing never auto-converts", base.routing.note.includes("אין המרה אוטומטית"), "");
  add("intent evidence present", base.intent.evidence.length > 0, "");

  // Agent proposals — recommendation-only.
  const proposals = leadAgent.run({ now: Date.now(), orgId: "o", data: { leads: [sig({ intent: "buyer", stage: "qualified", conversionProbability: 80 })] } });
  add("agent emits proposals per lead", proposals.length > 0 && proposals.every((p) => p.entityType === "lead" && p.entityId === "LD1"), "");
  add("agent emits mission proposal (approval-gated)", proposals.some((p) => p.kind === "mission" && !!p.missionType), "");
  add("agent no auto-exec", leadAgent.permissions.includes("REQUEST_APPROVAL") && !leadAgent.permissions.includes("AUTO_EXECUTE"), "");
  add("empty leads → no proposals", leadAgent.run({ now: Date.now(), orgId: "o", data: {} }).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
