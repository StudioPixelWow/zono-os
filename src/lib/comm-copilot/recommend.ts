// ============================================================================
// 🤖 ZONO — Copilot NEXT-BEST-ACTION (pure). Phase 2.
// ----------------------------------------------------------------------------
// Deterministically maps the classification + reused risk reasoning into one of
// six recommended actions (call / whatsapp / meeting / reminder / send_property
// / follow_up) with explainability. It DECIDES nothing on its own beyond a
// transparent mapping; the reasoning is carried from the risk engine when a risk
// drives it. The Copilot never sends — this is a recommendation only.
// ============================================================================
import { buildExplain } from "./explain";
import type { RecommendedActionArtifact, RecommendedActionKind, ConversationClassification } from "./types";
import type { ConversationAnalysis } from "./analyze";

const BY_CLASS: Record<ConversationClassification, { action: RecommendedActionKind; why: string }> = {
  new_lead: { action: "call", why: "פנייה מהירה לליד חדש מגדילה סיכויי המרה" },
  active_buyer: { action: "send_property", why: "שליחת התאמות נכסים ללקוח פעיל" },
  active_seller: { action: "meeting", why: "פגישת הערכת שווי ויישור ציפיות" },
  negotiation: { action: "meeting", why: "פגישה להסרת חסמים וסגירת פערים" },
  appointment: { action: "reminder", why: "אישור ותזכורת למועד הצפייה" },
  follow_up: { action: "follow_up", why: "השלמת המעקב שהובטח" },
  document_exchange: { action: "follow_up", why: "השלמת ואימות המסמכים" },
  inactive: { action: "whatsapp", why: "פנייה קצרה לחידוש קשר" },
  closed: { action: "follow_up", why: "טיפוח ארוך טווח" },
};

export function recommendAction(a: ConversationAnalysis, classification: ConversationClassification): RecommendedActionArtifact {
  const base = BY_CLASS[classification];
  // If a risk is active, prefer its reasoning + escalate to a direct action.
  const topRisk = a.risks[0];
  const urgent = a.sentiment.sentiment === "urgent" || a.intents.some((i) => i.intent === "ready_to_close");
  const action: RecommendedActionKind = urgent && a.waiting ? "call" : base.action;
  const reasoning = [
    urgent && a.waiting ? "כוונה גבוהה וממתין למענה — פנייה ישירה" : base.why,
    ...(topRisk ? [topRisk.reason] : []),
  ];
  const evidence = urgent ? (a.intentEvidence["ready_to_close"] ?? []) : [];
  const confidence = topRisk ? Math.min(95, topRisk.score) : (a.intents[0]?.score ?? 60);
  return {
    action,
    explain: buildExplain({
      confidence, reasoning, evidence: reasoning, evidenceMessageIds: evidence,
      deterministicSignals: [`classification:${classification}`, ...(topRisk ? [`risk:${topRisk.type}`] : []), ...(urgent ? ["intent:ready_to_close"] : [])],
      llmContribution: null,
    }),
  };
}
