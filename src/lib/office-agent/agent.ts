// ============================================================================
// 🏢 Office Growth Agent — definition (pure). 29.7. Part 10.
// Reuses the Agent Framework. Given injected office signals it emits a strategy
// mission proposal + decision recommendation proposals for the brokerage —
// approval-gated, never executed. Type-only framework import.
// ============================================================================
import { buildOfficeScorecard } from "./scorecard";
import { OFFICE_STRATEGY_HE, OFFICE_DECISION_HE, type OfficeSignals } from "./types";
import type { AgentDefinition, AgentProposal, Impact } from "@/lib/agent-framework/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const officeGrowthAgent: AgentDefinition = {
  id: "office-growth", type: "office_growth", name: "סוכן צמיחת המשרד",
  description: "מנהל את עסק התיווך עצמו: בריאות עסקית, מלאי, מתווכים, תחרות, משפכים ואסטרטגיית צמיחה — הצעות לאישור בלבד, ללא ביצוע אוטומטי.",
  scope: "office",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "weekly" },
  run: (ctx) => {
    const sigs = (ctx.data.offices as OfficeSignals[] | undefined) ?? [];
    if (!sigs.length) return [];
    const out: AgentProposal[] = [];
    for (const sig of sigs) {
      const card = buildOfficeScorecard(sig);
      const st = card.strategy;
      const impact: Impact = st.businessImpact;
      // Strategy → mission proposal (approval-gated).
      out.push({
        kind: "mission", title: `אסטרטגיית משרד: ${OFFICE_STRATEGY_HE[st.recommendedStrategy]} — ${st.playbook[0]?.action ?? ""}`,
        reason: st.why[0] ?? "אסטרטגיית צמיחה מומלצת",
        evidence: [`בריאות עסקית ${card.health.businessHealth}`, `צמיחה ${card.growthScore}`, `מיקום שוק ${card.marketPosition}`, st.expectedResult],
        confidence: st.confidence, impact, urgency: clamp(45 + st.confidence * 0.35),
        entityType: "office", entityId: sig.id, entityName: sig.name, missionType: st.playbook[0]?.missionType ?? "OFFICE_PIPELINE_REVIEW",
        ifIgnored: card.risks[0]?.title ?? "החמצת צמיחה", alternatives: st.alternatives.map((a) => OFFICE_STRATEGY_HE[a]),
      });
      // Top decisions → recommendation proposals (each explains WHY).
      for (const d of card.decisions.slice(0, 3)) out.push({
        kind: "recommendation", title: `${OFFICE_DECISION_HE[d.type]}: ${d.title}`, reason: d.why,
        evidence: d.evidence, confidence: clamp(card.aiConfidence), impact: d.impact,
        urgency: d.impact === "high" ? 80 : d.impact === "medium" ? 58 : 40,
        entityType: "office", entityId: sig.id, entityName: sig.name,
        missionType: d.requiresApproval ? "OFFICE_DECISION" : undefined,
        ifIgnored: card.risks[0]?.title ?? "החמצת שיפור",
      });
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, 40);
  },
};
