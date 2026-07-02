// ============================================================================
// 🛒 Buyer Intelligence Agent — definition (pure). 29.4. Part 10.
// Reuses the Agent Framework. Given injected buyer signals it emits recommendation
// + mission proposals (approval-gated, never executed). One agent monitoring
// every buyer. Type-only import — no runtime coupling to the framework.
// ============================================================================
import { buildBuyerScorecard } from "./scorecard";
import { BUYER_STRATEGY_HE, type BuyerSignals } from "./types";
import type { AgentDefinition, AgentProposal, Impact } from "@/lib/agent-framework/types";

const MAX_BUYERS = 25;

export const buyerAgent: AgentDefinition = {
  id: "buyer-intelligence", type: "buyer", name: "סוכן מודיעין קונים",
  description: "מנטר כל קונה ובונה אסטרטגיית קנייה מוסברת (מוכנות, התאמות, סיכונים, מהלך) — המלצה בלבד.",
  scope: "buyer",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "daily" },
  run: (ctx) => {
    const sigs = (ctx.data.buyers as BuyerSignals[] | undefined) ?? [];
    if (!sigs.length) return [];
    const out: AgentProposal[] = [];
    for (const sig of sigs.slice(0, MAX_BUYERS)) {
      const card = buildBuyerScorecard(sig);
      const st = card.strategy;
      const impact: Impact = st.businessImpact;
      // Strategy → mission proposal (approval-gated).
      out.push({
        kind: "mission", title: `${BUYER_STRATEGY_HE[st.recommendedStrategy]}: ${st.playbook[0]?.action ?? ""} — ${sig.name}`,
        reason: st.why[0] ?? "אסטרטגיית קנייה מומלצת",
        evidence: [`בריאות קונה ${card.health.buyerHealth}`, `הסתברות ${card.health.buyingConfidence}`, ...(card.matchIntel.perfect[0] ? [`התאמה מובילה ${card.matchIntel.perfect[0].score}`] : [])],
        confidence: st.confidence, impact, urgency: clamp(50 + st.confidence * 0.3),
        entityType: "buyer", entityId: sig.id, entityName: sig.name, missionType: st.playbook[0]?.missionType ?? "BUYER_FOLLOWUP",
        ifIgnored: card.risks[0]?.title ?? "החמצת חלון קנייה", alternatives: st.alternatives.map((a) => BUYER_STRATEGY_HE[a]),
      });
      // Top risk → recommendation proposal.
      if (card.risks[0]) out.push({
        kind: "recommendation", title: `טפל בסיכון: ${card.risks[0].title} — ${sig.name}`, reason: card.risks[0].title,
        evidence: card.risks[0].evidence, confidence: clamp(card.aiConfidence), impact: card.risks[0].severity,
        urgency: card.risks[0].severity === "high" ? 80 : 55, entityType: "buyer", entityId: sig.id, entityName: sig.name,
        ifIgnored: "פגיעה בסיכויי הסגירה",
      });
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, 40);
  },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
