// ============================================================================
// 🏷️ Seller Intelligence Agent — definition (pure). 29.5. Part 10.
// Reuses the Agent Framework. Given injected seller signals it emits recommendation
// + mission proposals (approval-gated, never executed). One agent monitoring
// every seller. Type-only import — no runtime coupling to the framework.
// ============================================================================
import { buildSellerScorecard } from "./scorecard";
import { SELLER_STRATEGY_HE, type SellerSignals } from "./types";
import type { AgentDefinition, AgentProposal, Impact } from "@/lib/agent-framework/types";

const MAX_SELLERS = 25;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const sellerAgent: AgentDefinition = {
  id: "seller-intelligence", type: "seller", name: "סוכן מודיעין מוכרים",
  description: "מנטר כל מוכר, נכסו, הערכת השווי, השוק והקשר עם המשרד — ובונה אסטרטגיית מכירה מוסברת. המלצה בלבד.",
  scope: "seller",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "daily" },
  run: (ctx) => {
    const sigs = (ctx.data.sellers as SellerSignals[] | undefined) ?? [];
    if (!sigs.length) return [];
    const out: AgentProposal[] = [];
    for (const sig of sigs.slice(0, MAX_SELLERS)) {
      const card = buildSellerScorecard(sig);
      const st = card.strategy;
      const impact: Impact = st.businessImpact;
      out.push({
        kind: "mission", title: `${SELLER_STRATEGY_HE[st.recommendedStrategy]}: ${st.playbook[0]?.action ?? ""} — ${sig.name}`,
        reason: st.why[0] ?? "אסטרטגיית מכירה מומלצת",
        evidence: [`בריאות מוכר ${card.health.sellerHealth}`, `מוכנות לחתימה ${card.health.readinessToSign}`, ...(card.buyerConnection.priorityBuyers[0] ? [`${card.buyerConnection.priorityBuyers.length} קונים בעדיפות`] : []), ...(card.property.valuationPosition !== "unknown" ? [`מחיר ${card.property.valuationPosition} לטווח`] : [])],
        confidence: st.confidence, impact, urgency: clamp(50 + st.confidence * 0.3),
        entityType: "seller", entityId: sig.id, entityName: sig.name, missionType: st.playbook[0]?.missionType ?? "SELLER_FOLLOWUP",
        ifIgnored: card.risks[0]?.title ?? "החמצת חלון מכירה", alternatives: st.alternatives.map((a) => SELLER_STRATEGY_HE[a]),
      });
      if (card.risks[0]) out.push({
        kind: "recommendation", title: `טפל בסיכון: ${card.risks[0].title} — ${sig.name}`, reason: card.risks[0].title,
        evidence: card.risks[0].evidence, confidence: clamp(card.aiConfidence), impact: card.risks[0].severity,
        urgency: card.risks[0].severity === "high" ? 82 : 55, entityType: "seller", entityId: sig.id, entityName: sig.name,
        ifIgnored: "פגיעה בבלעדיות/מכירה",
      });
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, 40);
  },
};
