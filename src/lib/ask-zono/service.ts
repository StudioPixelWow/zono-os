// ============================================================================
// 💬 ZONO — Ask ZONO™ — service / multi-engine executor (server-only). 30.1.
// Part 3. Understands the query, plans the MINIMAL engine set, then executes ONLY
// those engines by REUSING their existing services (Chief of Staff, Orchestrator,
// Listing/Buyer/Seller/Lead/Office agents), normalizes each into an EngineResult
// and synthesizes the answer. No engine modified; no business logic duplicated;
// every action is an approval-gated proposal; nothing auto-executes.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getOrchestratorDashboard } from "@/lib/agent-orchestrator";
import { getListingScorecards } from "@/lib/listing-agent";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { understandAndPlan, composeResponse } from "./ask";
import type { EngineId, EngineResult, EngineItem, QueryUnderstanding, AskZonoResponse, ChatTurn } from "./types";

const empty = (engine: EngineId, headline: string): EngineResult => ({ engine, headline, items: [], evidence: [], confidence: 40 });
const item = (title: string, detail: string, score: number | null): EngineItem => ({ title, detail, score });

async function runEngine(engine: EngineId, orgId: string | null, u: QueryUnderstanding): Promise<EngineResult> {
  switch (engine) {
    case "chief_of_staff": {
      const cos = await getChiefOfStaff(orgId).catch(() => null);
      if (!cos) return empty(engine, "צ׳יף אוף סטאף לא זמין");
      if (u.intent === "MISSIONS") {
        const items = cos.briefing.urgentMissions.slice(0, 5).map((m) => item(m.title, m.why ?? "", m.urgency ?? null));
        return { engine, headline: `${cos.briefing.urgentMissions.length} משימות דחופות · חסימות: ${cos.briefing.missionBlockers.length}`, items, evidence: cos.briefing.missionBlockers.slice(0, 4), confidence: cos.briefing.aiConfidence };
      }
      const items = cos.briefing.todaysPriorities.slice(0, 5).map((p) => item(p.title, p.why, p.urgency));
      return { engine, headline: `ציון עסקי ${cos.briefing.businessScore} · ביצוע ${cos.briefing.executionScore}`, items, evidence: cos.briefing.criticalRisks.slice(0, 4).map((r) => r.title), confidence: cos.briefing.aiConfidence };
    }
    case "orchestrator": {
      const o = await getOrchestratorDashboard(orgId).catch(() => null);
      if (!o) return empty(engine, "מנצח הסוכנים לא זמין");
      if (u.intent === "OPPORTUNITIES") {
        const items = o.opportunities.slice(0, 5).map((c) => item(c.title, c.why, c.opportunityScore));
        return { engine, headline: `${o.totals.opportunities} הזדמנויות · ${o.totals.potentialDeals} עסקאות פוטנציאליות`, items, evidence: o.opportunities.slice(0, 4).flatMap((c) => c.evidence).slice(0, 6), confidence: 70 };
      }
      const items = o.priorityQueue.slice(0, 5).map((p) => item(p.title, p.why, p.priorityScore));
      return { engine, headline: `${o.totals.highPriority} פריטים בעדיפות גבוהה · ${o.totals.conflicts} קונפליקטים`, items, evidence: o.conflicts.slice(0, 3).map((c) => `${c.entityLabel}: ${c.resolution.action}`), confidence: 70 };
    }
    case "listing": {
      const l = await getListingScorecards(orgId).catch(() => null);
      if (!l) return empty(engine, "סוכן המודעות לא זמין");
      if (u.intent === "VALUATION") {
        const items = l.scorecards.filter((c) => c.valuation.available).slice(0, 5).map((c) => item(c.title, `מיקום מול הערכה: ${c.valuation.rangePosition ?? "?"}${c.valuation.priceGapPct != null ? ` · פער ${c.valuation.priceGapPct}%` : ""}`, c.aiConfidence));
        return { engine, headline: `${items.length} נכסים עם הערכת שווי`, items, evidence: [`מתוך ${l.totals.properties} נכסים`], confidence: 68 };
      }
      const needsPrice = l.scorecards.filter((c) => c.strategy.recommendedStrategy === "reduce_price" || c.classification.includes("מתיישן") || c.valuation.rangePosition === "above");
      const items = needsPrice.slice(0, 6).map((c) => item(c.title, `אסטרטגיה: ${c.strategy.recommendedStrategy}${c.city ? ` · ${c.city}` : ""}`, c.aiConfidence));
      return { engine, headline: `${needsPrice.length} נכסים לבחינת מחיר · ${l.totals.stale} מתיישנים`, items, evidence: [`בריאים ${l.totals.healthy} · קריטיים ${l.totals.critical}`], confidence: 70 };
    }
    case "buyer": {
      const b = await getBuyerAgentScorecards(orgId).catch(() => null);
      if (!b) return empty(engine, "סוכן הקונים לא זמין");
      const closing = b.scorecards.filter((c) => ["CLOSE_DEAL", "NEGOTIATE", "LAWYER_STAGE", "BOOK_SECOND_VISIT"].includes(c.strategy.recommendedStrategy));
      const items = (closing.length ? closing : b.scorecards).slice(0, 6).map((c) => item(c.name, `${c.aiRecommendation}`, c.aiConfidence));
      return { engine, headline: `${closing.length} קונים קרובים לסגירה · ${b.totals.hot} חמים`, items, evidence: [`עם התאמות ${b.totals.withMatches} · קרים ${b.totals.cold}`], confidence: 72 };
    }
    case "seller": {
      const s = await getSellerAgentScorecards(orgId).catch(() => null);
      if (!s) return empty(engine, "סוכן המוכרים לא זמין");
      const atRisk = s.scorecards.filter((c) => c.health.churnRisk >= 55 || c.health.label === "בסיכון");
      const items = (atRisk.length ? atRisk : s.scorecards).slice(0, 6).map((c) => item(c.name, `נטישה ${c.health.churnRisk} · ${c.aiRecommendation}`, c.aiConfidence));
      return { engine, headline: `${atRisk.length} מוכרים בסיכון נטישה · ${s.totals.readyToSign} מוכנים לחתימה`, items, evidence: [`פערי מחיר ${s.totals.priceIssues} · עם קונים ${s.totals.withBuyers}`], confidence: 72 };
    }
    case "lead": {
      const d = await getLeadAgentScorecards(orgId).catch(() => null);
      if (!d) return empty(engine, "סוכן הלידים לא זמין");
      const items = d.scorecards.slice(0, 6).map((c) => item(c.name, `${c.intent.fit} · ${c.aiRecommendation}`, c.aiConfidence));
      return { engine, headline: `${d.totals.leads} לידים · ${d.totals.hot} חמים · ${d.totals.duplicates} כפילויות · ${d.totals.convertReady} להמרה`, items, evidence: [`ניתוב אנושי ${d.totals.humanReview}`], confidence: 70 };
    }
    case "office": {
      const o = await getOfficeGrowthScorecard(orgId).catch(() => null);
      const c = o?.scorecard ?? null;
      if (!c) return empty(engine, "סוכן צמיחת המשרד לא זמין");
      if (u.intent === "COMPETITION") {
        const items = c.competitive.slice(0, 6).map((f) => item(f.title, f.why, null));
        return { engine, headline: `${c.competitive.length} אותות תחרותיים · מיקום שוק ${c.marketPosition}`, items, evidence: c.competitive.slice(0, 4).flatMap((f) => f.evidence).slice(0, 6), confidence: c.aiConfidence };
      }
      if (u.intent === "RECRUIT_LOCATION") {
        const rec = [...c.brokerFindings.filter((f) => f.type === "recruitment_need" || f.type === "unused_capacity"), ...c.decisions.filter((d) => d.type === "RECRUIT" || d.type === "REALLOCATE")];
        const items = rec.slice(0, 6).map((f) => item(f.title, f.why, null));
        return { engine, headline: `אסטרטגיה: ${c.strategy.recommendedStrategy} · תפוקת מתווך ${c.brokerScore}`, items, evidence: c.brokerFindings.slice(0, 4).flatMap((f) => f.evidence).slice(0, 6), confidence: c.aiConfidence };
      }
      const items = c.decisions.slice(0, 6).map((d) => item(d.title, d.why, null));
      return { engine, headline: `בריאות עסקית ${c.health.businessHealth} · צמיחה ${c.growthScore} · מלאי ${c.inventoryScore}`, items, evidence: c.risks.slice(0, 4).map((r) => r.title), confidence: c.aiConfidence };
    }
    default:
      return empty(engine, "מנוע לא נתמך בשאילתה זו");
  }
}

/** Ask ZONO end-to-end: understand → plan → execute planned engines → synthesize. */
export async function askZono(orgId: string | null, query: string, history: ChatTurn[] = []): Promise<AskZonoResponse> {
  const { understanding, plan } = understandAndPlan(query, history);
  const results = plan.engines.length
    ? (await Promise.all(plan.engines.map((e) => runEngine(e, orgId, understanding).catch(() => empty(e, "המנוע נכשל"))))).filter((r) => r.items.length > 0 || r.evidence.length > 0)
    : [];
  return composeResponse(understanding, plan, results);
}
