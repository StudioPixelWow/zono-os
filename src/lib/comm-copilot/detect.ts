// ============================================================================
// 🤖 ZONO — Copilot MISSING-RESPONSE / ATTENTION detectors (pure). Phase 2.
// ----------------------------------------------------------------------------
// Surfaces conversations needing attention, REUSING the deterministic signals:
//   · unanswered_question — last inbound is a question and we haven't replied
//   · urgent             — urgent tone / ready-to-close while waiting on us
//   · waiting_too_long   — client waiting (ghosting/communication_breakdown risk)
//   · forgotten          — high-value idle (lost_opportunity risk)
// Each flag carries reason + evidence message ids + signals. No new engine.
// ============================================================================
import type { AttentionFlag } from "./types";
import type { ConversationAnalysis } from "./analyze";

export function detectAttention(a: ConversationAnalysis): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  const lastInbound = [...a.transcript].reverse().find((m) => m.direction === "inbound");
  const waitingOnUs = a.waiting;   // newest message is inbound & unanswered

  // Unanswered question — client asked, we haven't replied.
  const questionEvidence = a.intentEvidence["question"] ?? [];
  if (waitingOnUs && lastInbound && questionEvidence.includes(lastInbound.messageRef)) {
    flags.push({ kind: "unanswered_question", severity: "high", reason: "שאלה של הלקוח נותרה ללא מענה", evidenceMessageIds: [lastInbound.messageRef], signals: ["intent:question", "state:waiting"] });
  }

  // Urgent — urgent tone or ready-to-close while awaiting our reply.
  const urgent = a.sentiment.sentiment === "urgent" || a.intents.some((i) => i.intent === "ready_to_close");
  if (waitingOnUs && urgent) {
    const ev = (a.intentEvidence["ready_to_close"] ?? []).concat(lastInbound ? [lastInbound.messageRef] : []);
    flags.push({ kind: "urgent", severity: "high", reason: "הודעה דחופה/כוונת סגירה ממתינה למענה", evidenceMessageIds: [...new Set(ev)], signals: ["sentiment:urgent", "intent:ready_to_close", "state:waiting"] });
  }

  // Waiting too long — reused risk engine (ghosting / communication_breakdown).
  const waitRisk = a.risks.find((r) => r.type === "ghosting" || r.type === "communication_breakdown");
  if (waitRisk) {
    flags.push({ kind: "waiting_too_long", severity: waitRisk.severity === "high" ? "high" : "medium", reason: waitRisk.reason, evidenceMessageIds: lastInbound ? [lastInbound.messageRef] : [], signals: [`risk:${waitRisk.type}`] });
  }

  // Forgotten — reused risk engine (lost_opportunity: high-value idle).
  const lost = a.risks.find((r) => r.type === "lost_opportunity");
  if (lost) {
    flags.push({ kind: "forgotten", severity: "high", reason: lost.reason, evidenceMessageIds: [], signals: ["risk:lost_opportunity"] });
  }

  return flags;
}
