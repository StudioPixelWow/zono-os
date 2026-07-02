// ============================================================================
// 🏠 Listing Intelligence Agent — definition (pure). 29.3.
// Reuses the Agent Framework. Given injected per-property signals it reasons over
// the intelligence engines' output and emits recommendation + mission proposals
// (approval-gated, never executed). One logical agent monitoring every property.
// ============================================================================
import { buildScorecard } from "./scorecard";
import type { ListingSignals } from "./types";
// Type-only import — no runtime coupling to the framework.
import type { AgentDefinition, AgentProposal, Impact } from "@/lib/agent-framework/types";

const MAX_PROPERTIES = 20;

export const listingAgent: AgentDefinition = {
  id: "listing-intelligence", type: "listing", name: "סוכן מודיעין מודעות",
  description: "מנטר כל נכס וממליץ פרואקטיבית על פעולות (תמחור, שיווק, מוכר, קונים) — המלצה בלבד.",
  scope: "property",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "daily" },
  run: (ctx) => {
    const sigs = (ctx.data.listings as ListingSignals[] | undefined) ?? [];
    if (!sigs.length) return [];
    const out: AgentProposal[] = [];
    const now = ctx.now;
    for (const sig of sigs.slice(0, MAX_PROPERTIES)) {
      const card = buildScorecard(sig, now);
      const topRisk = card.risks[0]?.title ?? "החמצת הזדמנות";
      const recs = card.recommendations.slice(0, 2);
      recs.forEach((rec, idx) => {
        const impact: Impact = rec.impact;
        out.push({
          kind: idx === 0 ? "mission" : "recommendation",
          title: `${rec.action} — ${sig.title}`, reason: rec.reason,
          evidence: [...rec.evidence, `בריאות ${card.health.listingHealth} · ${card.health.label}`],
          confidence: rec.confidence, impact, urgency: rec.priority,
          entityType: "property", entityId: sig.id, entityName: sig.title,
          missionType: rec.missionType,
          ifIgnored: `${topRisk} — פגיעה במכירה`, alternatives: card.recommendations.slice(1, 3).map((r) => r.action),
        });
      });
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, 40);
  },
};
