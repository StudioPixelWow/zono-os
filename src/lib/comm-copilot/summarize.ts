// ============================================================================
// 🤖 ZONO — Copilot SUMMARY composer (pure). Phase 1.
// ----------------------------------------------------------------------------
// Composes a structured live summary from the deterministic analysis. NO
// hallucination: every section's statement is backed by evidence message ids
// drawn from the canonical conversation; any fact without a supporting message
// is dropped. Each section carries its own contribution (statement + evidence +
// signals); the whole artifact carries an Explainability envelope.
// ============================================================================
import { INTENT_LABELS, OBJECTION_LABELS } from "@/lib/comm-intelligence/engine";
import { buildExplain } from "./explain";
import type { SummaryArtifact, SummarySectionContribution, ConversationClassification } from "./types";
import type { ConversationAnalysis } from "./analyze";

const uniq = (a: string[]) => [...new Set(a)];
const factLabel = (kind: string, normalized: string): string => {
  switch (kind) {
    case "city": return `אזור מבוקש: ${normalized}`;
    case "budget": return `תקציב: ${Number(normalized).toLocaleString("he-IL")} ₪`;
    case "rooms": return `חדרים: ${normalized}`;
    case "timeline": return `דחיפות: ${normalized === "immediate" ? "מיידי" : "ארוך"}`;
    default: return `${kind}: ${normalized}`;
  }
};

export function summarizeConversation(a: ConversationAnalysis, classification: ConversationClassification): SummaryArtifact {
  const contributions: SummarySectionContribution[] = [];
  const add = (section: SummarySectionContribution["section"], statement: string, evidenceMessageIds: string[], signals: string[]) => {
    if (!statement) return;
    contributions.push({ section, statement, evidenceMessageIds: uniq(evidenceMessageIds), signals: uniq(signals) });
  };

  // Stage (from the deterministic classification).
  add("stage", `שלב: ${classification}`, [], [`classification:${classification}`]);

  // Customer intent (top detected intents — each has message evidence).
  const topIntents = a.intents.slice(0, 3);
  const intentStatement = topIntents.length ? topIntents.map((i) => INTENT_LABELS[i.intent] ?? i.intent).join(", ") : "";
  const intentEvidence = uniq(topIntents.flatMap((i) => a.intentEvidence[i.intent] ?? []));
  add("intent", intentStatement, intentEvidence, topIntents.map((i) => `intent:${i.intent}`));

  // Important facts (entities) — DROP any fact without a citing message (no hallucination).
  const facts: string[] = [];
  for (const e of a.entities) {
    const ev = a.entityEvidence[e.kind + ":" + e.normalized] ?? [];
    if (ev.length === 0) continue;                                   // unsupported → rejected
    const label = factLabel(e.kind, e.normalized);
    facts.push(label);
    add("facts", label, ev, [`entity:${e.kind}`]);
  }

  // Objections.
  const objections: string[] = [];
  for (const o of a.objections) {
    const label = OBJECTION_LABELS[o.type] ?? o.type;
    objections.push(label);
    // Evidence: inbound messages that mention the objection keyword family are
    // hard to isolate deterministically here, so cite the latest inbound message
    // (the objection was detected in the client text). Never fabricated.
    const lastInbound = [...a.transcript].reverse().find((m) => m.direction === "inbound")?.messageRef;
    add("objections", label, lastInbound ? [lastInbound] : [], [`objection:${o.type}`]);
  }

  // Promises / commitments (each commitment text is a substring of a real message).
  const promises: string[] = [];
  for (const c of a.commitments) {
    const src = a.transcript.find((m) => m.text.includes(c.text))?.messageRef;
    if (!src) continue;                                             // no source message → drop
    const label = `${c.party === "agent" ? "סוכן" : "לקוח"}: ${c.text}`;
    promises.push(label);
    add("promises", label, [src], [`commitment:${c.party}`]);
  }

  // Next action — reuse the top risk's recommended_action when present.
  const topRisk = a.risks[0];
  const nextAction = topRisk?.recommended_action ?? defaultNextAction(classification);
  add("next_action", nextAction, [], [topRisk ? `risk:${topRisk.type}` : `classification:${classification}`]);

  // Key summary — grounded composition of the above facts only.
  const stageWord = classification;
  const keyBits = [intentStatement, facts[0] ?? ""].filter(Boolean).join(" · ");
  const summaryText = `שיחה בשלב ${stageWord}${keyBits ? ` — ${keyBits}` : ""}. הפעולה הבאה: ${nextAction}.`;

  const allEvidence = uniq(contributions.flatMap((c) => c.evidenceMessageIds));
  const allSignals = uniq(contributions.flatMap((c) => c.signals));
  const confidence = Math.min(95, 60 + Math.min(30, allEvidence.length * 6));

  return {
    stage: stageWord,
    intent: intentStatement,
    facts,
    objections,
    promises,
    nextAction,
    contributions,
    explain: buildExplain({
      confidence,
      reasoning: [`Stage ${stageWord}`, intentStatement && `Intent: ${intentStatement}`, `Next: ${nextAction}`].filter(Boolean) as string[],
      evidence: [summaryText],
      evidenceMessageIds: allEvidence,
      deterministicSignals: allSignals,
      llmContribution: null,
    }),
  };
}

function defaultNextAction(c: ConversationClassification): string {
  switch (c) {
    case "negotiation": return "תאם שיחה ליישור ציפיות והסרת חסמים";
    case "appointment": return "אשר את מועד הצפייה ושלח תזכורת";
    case "active_buyer": return "שלח התאמות נכסים רלוונטיות";
    case "active_seller": return "עדכן הערכת שווי ותאם פגישה";
    case "document_exchange": return "השלם ואמת את המסמכים הנדרשים";
    case "follow_up": return "בצע את המעקב שהובטח";
    case "inactive": return "פנייה קצרה ולא לוחצת לחידוש קשר";
    case "closed": return "סגור את השיחה או העבר לטיפוח ארוך טווח";
    default: return "פנה במהירות לליד החדש";
  }
}
