// ============================================================================
// 🤖 ZONO — Copilot conversation ANALYZE (pure). Phase 1.
// ----------------------------------------------------------------------------
// Computes the deterministic signals the classifier + summary writer consume, by
// REUSING the existing comm-intelligence analyzers (detectIntents, extractEntities,
// computeRisks, detectCommitments, detectObjections, detectSentiment). It creates
// NO new intent engine. Pure + deterministic: `nowIso` is passed in. Operates on
// the channel-free analysis view, so it is transport-agnostic.
// ============================================================================
import {
  detectIntents, extractEntities, computeRisks, detectCommitments, detectObjections, detectSentiment,
  DAY, type CommIntent, type ExtractedEntity, type ComputedRisk, type DetectedCommitment, type ObjectionType,
} from "@/lib/comm-intelligence/engine";
import type { AnalysisMessage, CopilotConversationView } from "./types";

export interface ConversationAnalysis {
  ref: string;
  nowIso: string;
  messageCount: number;
  waiting: boolean;
  entityType: "buyer" | "seller" | "lead" | "unknown";
  daysSinceContact: number;
  daysSinceInbound: number;
  unansweredOutbound: number;
  intents: { intent: CommIntent; score: number }[];       // aggregate, client text
  entities: ExtractedEntity[];
  objections: { type: ObjectionType; severity: string }[];
  commitments: DetectedCommitment[];
  sentiment: { sentiment: string; score: number };
  risks: ComputedRisk[];
  crmLinks: CopilotConversationView["crmLinks"];
  /** message refs that triggered a given intent (for evidence). */
  intentEvidence: Record<string, string[]>;
  /** message refs that mention a given entity normalized value (for evidence). */
  entityEvidence: Record<string, string[]>;
  transcript: AnalysisMessage[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function analyzeConversation(view: CopilotConversationView, nowIso: string): ConversationAnalysis {
  const now = Date.parse(nowIso);
  const inbound = view.transcript.filter((m) => m.direction === "inbound");
  const clientText = inbound.map((m) => m.text).join("\n");
  const allText = view.transcript.map((m) => m.text).join("\n");

  // Recency.
  const lastMs = view.lastActivityAt ? Date.parse(view.lastActivityAt) : now;
  const lastInboundMs = inbound.length ? Date.parse(inbound[inbound.length - 1].sentAt) : null;
  const daysSinceContact = Math.max(0, Math.floor((now - lastMs) / DAY));
  const daysSinceInbound = lastInboundMs != null ? Math.max(0, Math.floor((now - lastInboundMs) / DAY)) : 999;

  // Unanswered outbound = trailing outbound messages after the last inbound.
  let unansweredOutbound = 0;
  for (let i = view.transcript.length - 1; i >= 0; i--) {
    if (view.transcript[i].direction === "outbound") unansweredOutbound++;
    else break;
  }

  // CRM-derived entity type (for the risk engine; not transport-specific).
  const entityType: ConversationAnalysis["entityType"] =
    view.crmLinks.seller ? "seller" : view.crmLinks.buyer ? "buyer" : view.crmLinks.lead ? "lead" : "unknown";

  // Reused analyzers (client text).
  const intents = detectIntents(clientText);
  const entities = extractEntities(clientText);
  const objections = detectObjections(clientText);
  const commitments = detectCommitments(allText);
  const sentiment = detectSentiment(clientText);

  // Per-message evidence maps.
  const intentEvidence: Record<string, string[]> = {};
  for (const m of view.transcript) {
    for (const { intent } of detectIntents(m.text)) (intentEvidence[intent] ??= []).push(m.messageRef);
  }
  const entityEvidence: Record<string, string[]> = {};
  for (const e of entities) {
    for (const m of view.transcript) if (m.text.includes(e.raw)) (entityEvidence[e.kind + ":" + e.normalized] ??= []).push(m.messageRef);
  }

  // Negative-sentiment streak over trailing inbound messages.
  let negativeSentimentStreak = 0;
  for (let i = inbound.length - 1; i >= 0; i--) {
    const s = detectSentiment(inbound[i].text).sentiment;
    if (s === "negative" || s === "frustrated" || s === "cold") negativeSentimentStreak++;
    else break;
  }

  // Lead-score proxy (canonical conversation has no transport lead_score; derive
  // deterministically from intent so the risk engine has a signal).
  const top = intents[0]?.intent;
  const leadScore = top === "ready_to_close" ? 80 : top === "buy" || top === "sell" ? 65 : 40;

  const risks = computeRisks({
    entityType, daysSinceContact, daysSinceInbound,
    unansweredOutbound, brokenCommitments: 0, overdueCommitments: 0,
    negativeSentimentStreak, openObjections: objections.length,
    hasActiveDeal: !!view.crmLinks.deal, leadScore,
  });

  return {
    ref: view.conversationRef, nowIso, messageCount: view.messageCount, waiting: view.waiting,
    entityType, daysSinceContact, daysSinceInbound, unansweredOutbound,
    intents, entities, objections, commitments, sentiment: { sentiment: sentiment.sentiment, score: clamp(sentiment.score) },
    risks, crmLinks: view.crmLinks, intentEvidence, entityEvidence, transcript: view.transcript,
  };
}
