// ============================================================================
// 🎯 Lead Intelligence Agent — definition (pure). 29.6. Parts 8 + 11.
// Reuses the Agent Framework. Given injected lead signals it emits recommendation
// + mission proposals (approval-gated, never executed). Routing/conversion are
// approval-gated mission proposals only. Type-only framework import.
// ============================================================================
import { buildLeadScorecard } from "./scorecard";
import { LEAD_STRATEGY_HE, ROUTING_HE, type LeadSignals } from "./types";
import type { AgentDefinition, AgentProposal, Impact } from "@/lib/agent-framework/types";

const MAX_LEADS = 30;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const leadAgent: AgentDefinition = {
  id: "lead-intelligence", type: "lead", name: "סוכן מודיעין לידים",
  description: "מסווג כל ליד, מזהה כוונה, מונע כפילויות, ומנתב לקונה/מוכר/שניהם/טיפוח — הצעות לאישור בלבד, ללא המרה אוטומטית.",
  scope: "lead",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "daily" },
  run: (ctx) => {
    const sigs = (ctx.data.leads as LeadSignals[] | undefined) ?? [];
    if (!sigs.length) return [];
    const out: AgentProposal[] = [];
    for (const sig of sigs.slice(0, MAX_LEADS)) {
      const card = buildLeadScorecard(sig);
      const st = card.strategy;
      const impact: Impact = st.businessImpact;
      out.push({
        kind: "mission", title: `${LEAD_STRATEGY_HE[st.recommendedStrategy]} → ${ROUTING_HE[card.routing.target]}: ${st.playbook[0]?.action ?? ""} — ${sig.name}`,
        reason: st.why[0] ?? "אסטרטגיית ליד מומלצת",
        evidence: [`כוונה ${card.intent.fit} (${card.intent.confidence}%)`, `המרה ${card.health.conversionProbability}`, `ניתוב מומלץ: ${ROUTING_HE[card.routing.target]}`],
        confidence: st.confidence, impact, urgency: clamp(50 + st.confidence * 0.3),
        entityType: "lead", entityId: sig.id, entityName: sig.name, missionType: st.playbook[0]?.missionType ?? "LEAD_FOLLOWUP",
        ifIgnored: card.risks[0]?.title ?? "החמצת ליד", alternatives: st.alternatives.map((a) => LEAD_STRATEGY_HE[a]),
      });
      if (card.risks[0]) out.push({
        kind: "recommendation", title: `טפל בסיכון: ${card.risks[0].title} — ${sig.name}`, reason: card.risks[0].title,
        evidence: card.risks[0].evidence, confidence: clamp(card.aiConfidence), impact: card.risks[0].severity,
        urgency: card.risks[0].severity === "high" ? 82 : 55, entityType: "lead", entityId: sig.id, entityName: sig.name,
        ifIgnored: "פגיעה בהמרה/איכות הליד",
      });
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, 40);
  },
};
