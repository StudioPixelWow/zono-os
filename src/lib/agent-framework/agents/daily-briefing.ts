// ============================================================================
// 🤖 Daily Briefing Agent (safe placeholder). 29.1. Part 12.
// Uses ONLY the existing Chief of Staff briefing (injected via context). It
// SUGGESTS today's priorities/risks as inbox recommendations — no new business
// logic, no execution. Permissions: READ / SUGGEST / REQUEST_APPROVAL.
// ============================================================================
import type { AgentDefinition, AgentProposal, Impact } from "../types";

interface RecLike { title: string; why?: string; evidence?: string[]; confidence?: number; businessImpact?: string; urgency?: number }
interface BriefingLike { businessScore?: number; executionScore?: number; todaysPriorities?: RecLike[]; criticalRisks?: RecLike[] }
const impactOf = (v?: string): Impact => (v === "high" ? "high" : v === "low" ? "low" : "medium");

export const dailyBriefingAgent: AgentDefinition = {
  id: "daily-briefing", type: "daily_briefing", name: "סוכן תדריך יומי",
  description: "מרכז את עדיפויות והסיכונים של היום מה-Chief of Staff להמלצות לאישור.",
  scope: "organization",
  permissions: ["READ", "SUGGEST", "REQUEST_APPROVAL"],
  schedule: { mode: "daily", hourUtc: 5 },
  run: (ctx) => {
    const b = ctx.data.briefing as BriefingLike | undefined;
    if (!b) return [];
    const out: AgentProposal[] = [];
    for (const p of (b.todaysPriorities ?? []).slice(0, 3)) out.push({
      kind: "recommendation", title: p.title, reason: p.why ?? "עדיפות יומית מה-Chief of Staff",
      evidence: p.evidence ?? [], confidence: p.confidence ?? 60, impact: impactOf(p.businessImpact), urgency: p.urgency ?? 60,
      entityType: "organization", ifIgnored: "העדיפות היומית עלולה להתפספס",
      alternatives: ["דחה ליום הבא", "העבר לסוכן ייעודי"],
    });
    for (const r of (b.criticalRisks ?? []).slice(0, 2)) out.push({
      kind: "recommendation", title: `סיכון: ${r.title}`, reason: r.why ?? "סיכון קריטי מה-Chief of Staff",
      evidence: r.evidence ?? [], confidence: r.confidence ?? 70, impact: "high", urgency: r.urgency ?? 80,
      entityType: "organization", ifIgnored: "חשיפה עסקית גוברת",
    });
    return out;
  },
};
