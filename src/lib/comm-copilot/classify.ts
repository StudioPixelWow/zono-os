// ============================================================================
// 🤖 ZONO — Copilot 9-LABEL CLASSIFIER (pure). Phase 1.
// ----------------------------------------------------------------------------
// Maps the deterministic ConversationAnalysis (built by REUSED comm-intelligence
// analyzers) into one of nine conversation labels. It creates no intent engine —
// it consumes `analysis.intents`/`entities`/`risks`/`commitments`. Every result
// carries a full Explainability envelope (confidence + reasoning + evidence
// message ids + deterministic signals). Optionally refined by a reused
// LifecycleStage (deriveCurrentStage output) when the caller supplies it.
// ============================================================================
import type { LifecycleStage } from "@/lib/digital-twin/customer/types";
import type { CommIntent } from "@/lib/comm-intelligence/engine";
import { buildExplain } from "./explain";
import type { ClassificationArtifact, ConversationClassification } from "./types";
import type { ConversationAnalysis } from "./analyze";

const DOC_RE = /(חוזה|מסמכים|מסמך|תעודת זהות|ת"ז|אישור|טופס|חתימה|נסח טאבו|תלוש)/;
const uniq = (a: string[]) => [...new Set(a)];

export interface ClassifyOptions { lifecycleStage?: LifecycleStage }

export function classifyConversation(a: ConversationAnalysis, opts: ClassifyOptions = {}): ClassificationArtifact {
  const scoreOf = (i: CommIntent) => a.intents.find((x) => x.intent === i)?.score ?? 0;
  const has = (i: CommIntent) => scoreOf(i) > 0;
  const evFor = (...intents: CommIntent[]) => uniq(intents.flatMap((i) => a.intentEvidence[i] ?? []));
  const stage = opts.lifecycleStage;
  const top = a.intents[0]?.intent;

  const make = (
    classification: ConversationClassification, confidence: number,
    reasoning: string[], evidenceMessageIds: string[], signals: string[],
  ): ClassificationArtifact => ({
    classification,
    explain: buildExplain({
      confidence, reasoning, evidenceMessageIds,
      evidence: reasoning,
      deterministicSignals: signals,
      llmContribution: null,
    }),
  });

  // 1. closed — explicit disengagement / lost.
  if (top === "disengaging" || stage === "lost") {
    return make("closed", Math.max(scoreOf("disengaging"), 70),
      ["Client explicitly disengaged", ...(stage === "lost" ? ["CRM lifecycle: lost"] : [])],
      evFor("disengaging"), uniq(["intent:disengaging", stage ? `lifecycle:${stage}` : ""].filter(Boolean)));
  }

  // 2. inactive — dormant / long silence.
  if (a.daysSinceContact >= 14 || stage === "dormant") {
    return make("inactive", Math.min(60 + a.daysSinceContact, 95),
      [`No activity for ${a.daysSinceContact} days`, ...(stage === "dormant" ? ["CRM lifecycle: dormant"] : [])],
      [], uniq(["recency:dormant", stage ? `lifecycle:${stage}` : ""].filter(Boolean)));
  }

  // 3. document exchange — contract/ID/form language present.
  const docMsgs = a.transcript.filter((m) => DOC_RE.test(m.text)).map((m) => m.messageRef);
  if (docMsgs.length > 0) {
    return make("document_exchange", 84, ["Document/contract exchange detected"], docMsgs, ["keyword:document"]);
  }

  // 4. negotiation — price/offer/counter movement.
  if (has("negotiation") || (has("price") && a.objections.some((o) => o.type === "price")) || stage === "negotiation") {
    const conf = Math.max(scoreOf("negotiation"), scoreOf("price"), stage === "negotiation" ? 80 : 0);
    const reasoning = [
      has("negotiation") ? "Negotiation language detected" : "Price objection under discussion",
      ...(a.objections.some((o) => o.type === "price") ? ["Open price objection"] : []),
      ...(stage === "negotiation" ? ["CRM lifecycle: negotiation"] : []),
    ];
    return make("negotiation", Math.max(conf, 76), reasoning, evFor("negotiation", "price"),
      uniq(["intent:negotiation", "intent:price", a.objections.some((o) => o.type === "price") ? "objection:price" : ""].filter(Boolean)));
  }

  // 5. appointment — viewing / scheduling.
  if (has("viewing")) {
    return make("appointment", Math.max(scoreOf("viewing"), 80), ["Viewing/appointment scheduling requested"],
      evFor("viewing"), ["intent:viewing"]);
  }

  // 6. follow_up — agent owes a follow-up and no active buy/sell motion.
  const agentCommit = a.commitments.filter((c) => c.party === "agent");
  const weakIntent = !has("buy") && !has("sell") && !has("invest") && !has("financing");
  if (agentCommit.length > 0 && weakIntent) {
    const lastOut = [...a.transcript].reverse().find((m) => m.direction === "outbound")?.messageRef;
    return make("follow_up", 74, ["Agent committed to follow up", `${agentCommit.length} open agent commitment(s)`],
      lastOut ? [lastOut] : [], ["commitment:agent"]);
  }

  // 7. active_seller.
  if (has("sell") || a.crmLinks.seller || stage === "seller" || stage === "owner") {
    return make("active_seller", Math.max(scoreOf("sell"), a.crmLinks.seller ? 78 : 0, 72),
      [has("sell") ? "Selling intent detected" : "Linked to a seller record"],
      evFor("sell"), uniq(["intent:sell", a.crmLinks.seller ? "crm:seller" : "", stage ? `lifecycle:${stage}` : ""].filter(Boolean)));
  }

  // 8. active_buyer.
  const buyerIntent = has("buy") || has("financing") || has("invest");
  if ((buyerIntent && (a.crmLinks.buyer || a.messageCount > 2)) || a.crmLinks.buyer || stage === "buyer_viewing" || stage === "qualified" || stage === "repeat_buyer" || stage === "investor") {
    return make("active_buyer", Math.max(scoreOf("buy"), scoreOf("financing"), scoreOf("invest"), a.crmLinks.buyer ? 78 : 0, 72),
      [buyerIntent ? "Active buying/financing interest" : "Linked to a buyer record"],
      evFor("buy", "financing", "invest"),
      uniq(["intent:buy", "intent:financing", a.crmLinks.buyer ? "crm:buyer" : "", stage ? `lifecycle:${stage}` : ""].filter(Boolean)));
  }

  // 9. new_lead — early inbound / default.
  return make("new_lead", has("buy") || has("sell") ? Math.max(scoreOf("buy"), scoreOf("sell")) : 55,
    ["Early-stage inbound conversation", `${a.messageCount} message(s), not yet linked`],
    evFor("buy", "sell", "question"), uniq(["intent:" + (top ?? "unknown"), "recency:new"]));
}
