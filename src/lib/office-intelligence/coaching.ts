// ============================================================================
// ZONO — deterministic coaching engine (pure, explainable). Turns agent metrics
// into specific, actionable coaching items. AI may later rephrase the wording.
// ============================================================================
import type { AgentMetrics, CoachingItem, Severity } from "./types";

function id(agentId: string, type: string): string { return `coach-${agentId}-${type}`; }

/** Derive coaching items from agent metrics. Deterministic + explainable. */
export function deriveCoachingItems(agents: AgentMetrics[]): CoachingItem[] {
  const out: CoachingItem[] = [];
  for (const a of agents) {
    // Overdue tasks.
    if (a.overdueTasks >= 5) {
      const severity: Severity = a.overdueTasks >= 12 ? "high" : "medium";
      out.push({ id: id(a.agentId, "overdue_tasks"), agentId: a.agentId, agentName: a.name, itemType: "overdue_tasks", severity,
        title: `${a.name} עם ${a.overdueTasks} משימות באיחור`, message: `הצטברו ${a.overdueTasks} משימות שעבר זמנן.`, recommendedAction: "לתעדף סגירת משימות פתוחות היום." });
    }
    // Ignored perfect matches.
    if (a.ignoredHotOpportunities > 0) {
      out.push({ id: id(a.agentId, "missed_opportunity"), agentId: a.agentId, agentName: a.name, itemType: "missed_opportunity", severity: a.ignoredHotOpportunities >= 5 ? "urgent" : "high",
        title: `${a.name} לא טיפל ב־${a.ignoredHotOpportunities} הזדמנויות חמות`, message: `${a.ignoredHotOpportunities} הזדמנויות בסבירות גבוהה ללא פנייה.`, recommendedAction: "להקצות זמן לפנייה להזדמנויות החמות עוד היום." });
    }
    // Low activity.
    if (a.calls + a.whatsapps + a.meetings === 0) {
      out.push({ id: id(a.agentId, "low_activity"), agentId: a.agentId, agentName: a.name, itemType: "low_activity", severity: "medium",
        title: `${a.name} ללא פעילות תקשורת היום`, message: "לא תועדו שיחות, וואטסאפ או פגישות.", recommendedAction: "לוודא שהסוכן פעיל ומתעד פניות." });
    }
    // Fast response but weak conversion.
    if ((a.avgResponseHours != null && a.avgResponseHours <= 3) && a.conversionRate < 0.15 && a.calls + a.whatsapps >= 5) {
      out.push({ id: id(a.agentId, "weak_conversion"), agentId: a.agentId, agentName: a.name, itemType: "weak_conversion", severity: "medium",
        title: `${a.name} מגיב מהר אך ממיר מעט לפגישות`, message: "זמן תגובה מצוין אך שיעור המרה נמוך.", recommendedAction: "לחזק טכניקות סגירה לקביעת פגישות." });
    }
    // High potential — strong activity, deserves more leads.
    if (a.conversionRate >= 0.4 && a.exclusivesSigned >= 1) {
      out.push({ id: id(a.agentId, "high_potential"), agentId: a.agentId, agentName: a.name, itemType: "high_potential", severity: "low",
        title: `${a.name} בעל ביצועים גבוהים`, message: "המרה גבוהה ובלעדיות שנחתמו — שווה להזרים יותר הזדמנויות.", recommendedAction: "להקצות הזדמנויות בלעדיות נוספות." });
    }
  }
  const rank: Record<Severity, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
