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
// Batch 5.6H/5.7 — Journey answers come from the CANONICAL providers only.
// 5.7: the Journey AI Coach is the reasoning layer — built on the same shared
// projection + queue identity, adding evidence-referenced explanations and
// never a second analytics path.
import { getJourneyCoach } from "@/lib/journey-coach/service";
// Batch 5.8 — the canonical Executive Decision Engine (pure prioritization
// over existing canonical evidence; top-3, inherited confidence).
import { getExecutiveDecisions } from "@/lib/executive-decision/service";
import { understandAndPlan, composeResponse } from "./ask";
import { assembleEntityContext } from "@/lib/ai-context/assembler";
import { renderContextText } from "@/lib/ai-context/render";
import { modePolicy, type ContextMode } from "@/lib/ai-context/modes";
import type { EngineId, EngineResult, EngineItem, QueryUnderstanding, AskZonoResponse, ChatTurn, AskContextInput, SharedContextEnvelope } from "./types";

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
    case "customer_journey": {
      // 5.6H/5.7 — Journey answers come ONLY from the canonical providers.
      // The Coach adds evidence-referenced explanations; every number remains
      // traceable (counts/dwell to Journey Center's evidence-gated KPIs, items
      // to queue recommendations with their own identity/confidence). Nothing
      // is re-derived here, and workload never reaches the Copilot (the Coach
      // is member-safe by construction).
      const coach = await getJourneyCoach("SHORT").catch(() => null);
      const j = coach?.projection ?? null;
      if (!coach || !j || j.status === "unavailable") return empty(engine, "מרכז המסעות לא זמין — לא ניתן להסיק מצב");
      // Journeys needing attention, explained by the Coach: queue-backed first
      // (canonical identity + real confidence), then verified stalls/blockers.
      const items = coach.briefings
        .filter((b) => b.needsAttention)
        .slice(0, 5)
        .map((b) => item(
          `${b.facts.entityName} · ${b.facts.stageLabel}`,
          b.recommendedNextStep,
          b.facts.recommendation?.priority ?? null,
        ));
      const dwellLine = j.dwell.avgDaysInStage == null
        ? "ממוצע שהייה בשלב: אין ראיה מספקת — מסעות ללא מועד כניסה מאומת אינם נספרים כאפס"
        : `ממוצע שהייה בשלב: ${j.dwell.avgDaysInStage} ימים (${j.dwell.evidenceStatus === "verified" ? "ראיה מאומתת" : "ראיה חלקית"})`;
      const coachLine = items.length === 0
        ? "המאמן הקנוני: אין מסע הדורש טיפול על בסיס ראיות מאומתות — אפס כנה, לא עדות לתקינות."
        : `המאמן הקנוני: ${coach.attentionCount} מסעות דורשים תשומת לב על בסיס ראיות מאומתות.`;
      return {
        engine,
        headline: `${j.counts.active} מסעות פעילים · ${j.counts.stalled} תקועים · ${j.counts.blocked} חסומים (ראיה קנונית בלבד)`,
        items,
        // The audit trace IS the evidence — every headline number explains its
        // canonical origin, including the honest zero-recommendation state.
        evidence: [dwellLine, coachLine, ...j.audit.trace.slice(0, 4), j.headline],
        // Data-quality coverage (canonical vs fallback records) — an evidence
        // measure, deliberately NOT an invented AI-confidence score.
        confidence: j.coverage.value ?? 40,
      };
    }
    case "executive_decision": {
      // 5.8 — decisions come ONLY from the canonical Decision Engine: at most
      // three, upstream priorities/confidence inherited verbatim, an honest
      // single "no action required" when nothing meets the bar. Nothing is
      // re-scored here.
      const d = await getExecutiveDecisions().catch(() => null);
      if (!d) return empty(engine, "מנוע ההחלטות לא זמין — לא ניתן להסיק החלטות");
      const items = d.decisions.map((dec) =>
        item(`${dec.priority}. ${dec.headline}`, `${dec.whyNow} ← ${dec.recommendedAction}`, dec.upstreamPriority));
      return {
        engine,
        headline: d.noActionRequired
          ? "אין פעולה ניהולית נדרשת כרגע (על בסיס כלל הראיות הקנוניות)"
          : `${d.decisions.length} החלטות ניהוליות עומדות ברף הראיות (מתוך מקסימום 3)`,
        items,
        evidence: d.decisions.flatMap((dec) => dec.evidence.slice(0, 2).map((e) => `${e.label} · ${e.source}`)).slice(0, 8),
        // Inherited-or-nothing: the max upstream confidence when one exists;
        // a neutral floor otherwise (understanding-weighting happens upstream).
        confidence: Math.max(0, ...d.decisions.map((dec) => dec.confidence ?? 0)) || 40,
      };
    }
    default:
      return empty(engine, "מנוע לא נתמך בשאילתה זו");
  }
}

const VALID_MODES = new Set<ContextMode>(["internal_entity", "internal_global", "executive", "broker_private", "public_site", "document_scoped", "recommendation_explanation"]);

/**
 * Build the shared-context envelope for an Ask request through the ONE canonical
 * assembler (no screen-local context). Entity present → mode-scoped entity
 * context; public surfaces use public_site (public-safe only). Best-effort:
 * a context failure never breaks Ask (partial diagnostics recorded instead).
 */
async function buildSharedContext(orgId: string | null, ctx: AskContextInput): Promise<SharedContextEnvelope | undefined> {
  if (!ctx.entityType || !ctx.entityId) return undefined;
  const mode: ContextMode = VALID_MODES.has(ctx.mode as ContextMode) ? (ctx.mode as ContextMode) : "internal_entity";
  try {
    const assembled = await assembleEntityContext({ mode, entityType: ctx.entityType, entityId: ctx.entityId });
    const text = renderContextText(assembled, { forBroadPrompt: modePolicy(mode).forBroadPrompt });
    return {
      mode, surface: ctx.surface ?? null, entityType: ctx.entityType, entityId: ctx.entityId,
      organizationId: orgId, userId: ctx.userId ?? null, conversationId: ctx.conversationId ?? null,
      text, provenanceCount: assembled.provenance?.length ?? 0,
      failedLayers: assembled.diagnostics?.failedLayers ?? [], truncated: assembled.diagnostics?.truncated ?? {},
    };
  } catch {
    // Never fabricate context — surface the failure as an empty, honest envelope.
    return {
      mode, surface: ctx.surface ?? null, entityType: ctx.entityType, entityId: ctx.entityId,
      organizationId: orgId, userId: ctx.userId ?? null, conversationId: ctx.conversationId ?? null,
      text: "", provenanceCount: 0, failedLayers: ["assembler"], truncated: {},
    };
  }
}

/** Ask ZONO end-to-end: understand → plan → execute planned engines → synthesize.
 *  When a surface passes entity context, the shared assembler enriches the answer
 *  (memory + timeline + graph + recommendations), permission-safe per mode. */
export async function askZono(orgId: string | null, query: string, history: ChatTurn[] = [], ctx?: AskContextInput): Promise<AskZonoResponse> {
  const { understanding, plan } = understandAndPlan(query, history);
  const [results, sharedContext] = await Promise.all([
    plan.engines.length
      ? Promise.all(plan.engines.map((e) => runEngine(e, orgId, understanding).catch(() => empty(e, "המנוע נכשל")))).then((rs) => rs.filter((r) => r.items.length > 0 || r.evidence.length > 0))
      : Promise.resolve([] as EngineResult[]),
    ctx ? buildSharedContext(orgId, ctx) : Promise.resolve(undefined),
  ]);
  const response = composeResponse(understanding, plan, results);
  return sharedContext ? { ...response, sharedContext } : response;
}
