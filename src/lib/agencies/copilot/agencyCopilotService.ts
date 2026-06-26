// ============================================================================
// ZONO — PHASE 26.10: AI Copilot service (SERVER-ONLY). The typed public API:
// guardrails → parse → route intent → build grounded context → build Hebrew
// answer. Plus data-driven suggested questions. No external lookups, no mock
// data, no invented answers — everything is grounded in stored ZONO records.
// ============================================================================
import "server-only";
import { getMyOperatingAreas } from "@/lib/operating-areas/service";
import { getCompetitionRadarAgencies, getCompetitionRadarSignals } from "../ui/competitionRadarQueries";
import { parseAgencyIntelQuestion } from "./agencyCopilotQueryParser";
import { detectAgencyIntent } from "./agencyCopilotRouter";
import { buildAgencyIntelContext } from "./agencyCopilotContextBuilder";
import { buildAgencyIntelAnswer } from "./agencyCopilotAnswerBuilder";
import { checkAgencyCopilotGuardrails, buildGuardrailAnswer } from "./agencyCopilotGuardrails";
import { sanitizeWording } from "../governance/agencyVisibilityGuard";
import type {
  AgencyCopilotAnswer, AgencyCopilotContext, ParsedAgencyQuery, SuggestedQuestion, AnswerAgencyQuestionOptions,
} from "./agencyCopilotTypes";

export { parseAgencyIntelQuestion, buildAgencyIntelAnswer, buildAgencyIntelContext };

/** Answer a free-text Hebrew question about agency/competition intelligence. */
export async function answerAgencyIntelQuestion(organizationId: string, question: string, _options: AnswerAgencyQuestionOptions = {}): Promise<AgencyCopilotAnswer> {
  void _options;
  const parsed = parseAgencyIntelQuestion(question);
  const intent = detectAgencyIntent(question, parsed);

  const guard = checkAgencyCopilotGuardrails(question);
  if (!guard.allowed) return buildGuardrailAnswer(intent, guard.message ?? "");

  const context: AgencyCopilotContext = await buildAgencyIntelContext(organizationId, parsed, intent);
  const answer = buildAgencyIntelAnswer(context);
  // Governance (Phase 26.14): enforce compliant output wording.
  return {
    ...answer,
    answer: sanitizeWording(answer.answer),
    highlights: answer.highlights.map(sanitizeWording),
    recommendations: answer.recommendations.map(sanitizeWording),
  };
}

/** Helper kept for the documented API surface. */
export function parseAgencyIntel(question: string): ParsedAgencyQuery {
  return parseAgencyIntelQuestion(question);
}

/** Smart suggested questions derived from the org's real data (onboarding-style when empty). */
export async function getSuggestedAgencyQuestions(_organizationId: string): Promise<SuggestedQuestion[]> {
  void _organizationId;
  const [agencies, signals, areasRes] = await Promise.all([
    getCompetitionRadarAgencies({ limit: 3 }),
    getCompetitionRadarSignals({ limit: 1 }),
    getMyOperatingAreas().catch(() => ({ areas: [] as Awaited<ReturnType<typeof getMyOperatingAreas>>["areas"] })),
  ]);
  const primary = areasRes.areas.find((a) => a.isPrimary && a.isActive) ?? areasRes.areas.find((a) => a.isActive) ?? areasRes.areas[0];
  const cityLabel = primary?.cityName || "האזור שלי";

  if (agencies.length === 0) {
    return [
      { question: "אילו נתונים צריך כדי לזהות מתחרים באזור שלי?", intent: "unknown" },
      { question: "איך ZONO בונה מודיעין תחרותי על משרדי תיווך?", intent: "unknown" },
      { question: "מה צריך לסרוק כדי לקבל ניתוח מתחרים?", intent: "unknown" },
    ];
  }

  const out: SuggestedQuestion[] = [
    { question: `מי המשרד הכי חזק ב${cityLabel}?`, intent: "top_agencies_in_area" },
    { question: "איזה מתחרה הכי מסוכן לי כרגע?", intent: "high_threat_competitors" },
    { question: "אילו מתחרים התחזקו החודש?", intent: "recent_growth" },
  ];
  if (primary?.cityName) out.push({ question: `איפה יש לי הזדמנות ב${primary.cityName}?`, intent: "territory_opportunity" });
  if (signals.length > 0) out.push({ question: "מה השתנה לאחרונה בשוק שלי?", intent: "signals_summary" });
  out.push({ question: `ספר לי על ${agencies[0].name}`, intent: "agency_summary" });
  return out.slice(0, 5);
}
