/**
 * LOCAL-DEV-ONLY check for AI Copilot for Competition Intelligence (Phase 26.10).
 * Pure layers only (no DB). Verifies: intent routing · Hebrew area/agency/period
 * parsing · guardrail rejection · grounded answers (no-data, low-confidence,
 * strongest competitor, territory opportunity, dominance, high threat) · the
 * structured response contract.
 *
 * Run: npx tsx scripts/agency-copilot-dev-check.ts
 */
import { parseAgencyIntelQuestion } from "../src/lib/agencies/copilot/agencyCopilotQueryParser";
import { detectAgencyIntent } from "../src/lib/agencies/copilot/agencyCopilotRouter";
import { checkAgencyCopilotGuardrails, GUARDRAIL_MESSAGE } from "../src/lib/agencies/copilot/agencyCopilotGuardrails";
import { buildAgencyIntelAnswer } from "../src/lib/agencies/copilot/agencyCopilotAnswerBuilder";
import type { AgencyCopilotContext, AgencyCopilotIntent } from "../src/lib/agencies/copilot/agencyCopilotTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const intentOf = (q: string): AgencyCopilotIntent => detectAgencyIntent(q, parseAgencyIntelQuestion(q));

function ctx(p: Partial<AgencyCopilotContext> & { intent: AgencyCopilotIntent }): AgencyCopilotContext {
  return {
    intent: p.intent,
    parsed: p.parsed ?? parseAgencyIntelQuestion(""),
    organizationId: "org1",
    hasData: p.hasData ?? true,
    confidence: p.confidence ?? 0.7,
    missingData: p.missingData ?? [],
    sources: p.sources ?? [{ table: "agency_scores", records: 3 }],
    resolvedArea: p.resolvedArea ?? null,
    userArea: p.userArea ?? null,
    agencies: p.agencies ?? [],
    territories: p.territories ?? [],
    signals: p.signals ?? [],
    timeline: p.timeline ?? [],
    opportunities: p.opportunities ?? [],
    agencyDetail: p.agencyDetail ?? null,
    comparison: p.comparison ?? null,
  };
}

function main(): void {
  console.log("AI Copilot (Competition Intelligence) dev-check\n");

  // 1) Intent routing.
  console.log("Intent routing:");
  assert(intentOf("מי המשרד הכי חזק בקריית ביאליק?") === "top_agencies_in_area", "strongest-in-area → top_agencies_in_area");
  assert(intentOf("איזה משרד התחזק החודש?") === "recent_growth", "growth → recent_growth");
  assert(intentOf("איפה יש לי הזדמנות באזור בלי הרבה תחרות?") === "territory_opportunity" || intentOf("איפה יש לי הזדמנות?") === "weak_user_area", "opportunity → territory/weak");
  assert(intentOf("מי שולט בשכונת אפקה?") === "dominance_by_area", "dominance → dominance_by_area");
  assert(intentOf("איזה מתחרה הכי מסוכן לי כרגע?") === "high_threat_competitors", "danger → high_threat_competitors");
  assert(intentOf("איזה מתחרה הכי חזק?") === "strongest_competitor", "strongest competitor (no area)");
  assert(intentOf("מה השתנה השבוע בשוק שלי?") === "signals_summary", "changes → signals_summary");
  assert(intentOf("השווה בין רימקס לאנגלו סכסון") === "agency_comparison", "comparison → agency_comparison");
  assert(intentOf("ספר לי על משרד אנגלו סכסון") === "agency_summary", "single agency → agency_summary");
  assert(intentOf("מה מזג האוויר היום?") === "unknown", "irrelevant → unknown");

  // 2) Hebrew parsing.
  console.log("\nHebrew parsing:");
  const p1 = parseAgencyIntelQuestion("מי המשרד הכי חזק בקריית ביאליק החודש?");
  assert(p1.city === "קריית ביאליק", "parses 'קריית ביאליק' as city");
  assert(p1.periodDays === 30 && p1.periodLabel === "החודש האחרון", "parses 'החודש' → 30 days");
  const p2 = parseAgencyIntelQuestion("מי שולט בשכונת אפקה?");
  assert(p2.neighborhood === "אפקה" && p2.city === null, "parses neighborhood 'אפקה', no city");
  const p3 = parseAgencyIntelQuestion("ספר לי על משרד אנגלו סכסון");
  assert(p3.agencyName !== null && p3.agencyName!.includes("אנגלו"), "parses agency name after 'משרד'");
  const p4 = parseAgencyIntelQuestion("השווה בין רימקס לאנגלו");
  assert(p4.agencyNames.length === 2, "parses two agency names for comparison");

  // 3) Guardrails.
  console.log("\nGuardrails:");
  assert(checkAgencyCopilotGuardrails("תן לי את הטלפון האישי של בעל המשרד").allowed === false, "private data → blocked");
  assert(checkAgencyCopilotGuardrails("איך לפרוץ למערכת של מתחרה?").allowed === false, "hacking → blocked");
  assert(checkAgencyCopilotGuardrails("תבטיח לי ב-100% מי ינצח").allowed === false, "false certainty → blocked");
  assert(checkAgencyCopilotGuardrails("מי המשרד הכי חזק באזור?").allowed === true, "legit question → allowed");
  assert(checkAgencyCopilotGuardrails("כתובת הבית של המתווך").message === GUARDRAIL_MESSAGE, "private-data uses mandated wording");

  // 4) Grounded answers.
  console.log("\nGrounded answers:");
  const noData = buildAgencyIntelAnswer(ctx({ intent: "strongest_competitor", hasData: false, confidence: 0, missingData: ["אין עדיין ציוני משרדים."], sources: [] }));
  assert(noData.answer.includes("על בסיס הנתונים הקיימים במערכת") && noData.recommendations.length > 0, "no-data → honest grounded answer + suggestions");
  assert(noData.confidence === 0, "no-data → confidence 0");

  const lowConf = buildAgencyIntelAnswer(ctx({
    intent: "strongest_competitor", confidence: 0.2,
    agencies: [{ id: "a1", name: "רימקס מרכז", city: "חיפה", overall: 70, threat: 65, momentum: 40, dataConfidence: 20, topSignalTitle: null, summarySnippet: null }],
  }));
  assert(lowConf.answer.includes("⚠️") && lowConf.answer.includes("רימקס מרכז"), "low-confidence → names competitor + low-confidence caveat");

  const strongest = buildAgencyIntelAnswer(ctx({
    intent: "strongest_competitor", confidence: 0.8,
    agencies: [
      { id: "a1", name: "אנגלו סכסון", city: "תל אביב", overall: 88, threat: 80, momentum: 60, dataConfidence: 80, topSignalTitle: null, summarySnippet: null },
      { id: "a2", name: "רימקס", city: "תל אביב", overall: 70, threat: 55, momentum: 50, dataConfidence: 70, topSignalTitle: null, summarySnippet: null },
    ],
  }));
  assert(strongest.answer.includes("אנגלו סכסון") && strongest.highlights.length >= 2, "strongest competitor → names #1 + highlights");
  assert(!strongest.answer.includes("⚠️"), "high confidence → no low-confidence caveat");

  const opp = buildAgencyIntelAnswer(ctx({
    intent: "territory_opportunity", confidence: 0.55, resolvedArea: { city: "חיפה", neighborhood: null },
    opportunities: [{ label: "כרמל צרפתי", city: "חיפה", neighborhood: "כרמל צרפתי", agencyCount: 0, topDominance: null, reason: "אין עדיין משרד דומיננטי" }],
  }));
  assert(opp.answer.includes("כרמל צרפתי") && opp.recommendations.length > 0, "territory opportunity → names area + recommendation");

  const dom = buildAgencyIntelAnswer(ctx({
    intent: "dominance_by_area", confidence: 0.6, resolvedArea: { city: "חיפה", neighborhood: "אפקה" },
    territories: [{ agencyId: "a1", agencyName: "משרד אלפא", territoryType: "neighborhood", label: "אפקה", dominance: 82, inventoryShare: 0.4, momentum: 55, trend: "growing", confidence: 0.6 }],
  }));
  assert(dom.answer.includes("משרד אלפא") && dom.answer.includes("אפקה"), "dominance by area → names dominant agency + area");

  const threat = buildAgencyIntelAnswer(ctx({
    intent: "high_threat_competitors", confidence: 0.7,
    agencies: [
      { id: "a1", name: "סכנה בע\"מ", city: "חיפה", overall: 75, threat: 90, momentum: 70, dataConfidence: 75, topSignalTitle: "נכנס ל-3 שכונות חדשות", summarySnippet: null },
      { id: "a2", name: "רגוע", city: "חיפה", overall: 60, threat: 40, momentum: 30, dataConfidence: 60, topSignalTitle: null, summarySnippet: null },
    ],
  }));
  assert(threat.answer.includes("סכנה") && threat.answer.includes("90"), "high threat → names highest-threat competitor + score");

  // 5) Structured contract shape.
  console.log("\nStructured contract:");
  const keys = Object.keys(strongest).sort().join(",");
  assert(keys === ["answer", "confidence", "entities", "highlights", "intent", "missing_data", "recommendations", "source_summary"].sort().join(","), "answer has exactly the structured fields");
  assert(Array.isArray(strongest.entities) && Array.isArray(strongest.missing_data) && Array.isArray(strongest.source_summary), "entities/missing_data/source_summary are arrays");

  console.log(`\n${failures === 0 ? "✅ ALL COPILOT CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
