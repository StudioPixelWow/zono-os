// ============================================================================
// 🤖 Mission Follow-up Agent (safe placeholder). 29.1. Part 12.
// Uses ONLY the existing Mission Action Center (injected via context). It
// SUGGESTS follow-ups for blocked/waiting missions and proposes follow-up
// missions for critical ones — all requiring approval, none executed.
// Permissions: READ / SUGGEST / CREATE_MISSION / REQUEST_APPROVAL.
// ============================================================================
import type { AgentDefinition, AgentProposal } from "../types";

interface MissionLike { id: string; goal?: string; missionType?: string; entityName?: string | null; priority?: number }
interface ActionCenterLike { blocked?: MissionLike[]; waiting?: MissionLike[]; critical?: MissionLike[] }
const label = (m: MissionLike) => m.goal || m.missionType || "משימה";

export const missionFollowupAgent: AgentDefinition = {
  id: "mission-followup", type: "mission_followup", name: "סוכן מעקב משימות",
  description: "מזהה משימות חסומות/ממתינות ומציע מעקב או משימת המשך — לאישור בלבד.",
  scope: "missions",
  permissions: ["READ", "SUGGEST", "CREATE_MISSION", "REQUEST_APPROVAL"],
  schedule: { mode: "daily" },
  run: (ctx) => {
    const ac = ctx.data.actionCenter as ActionCenterLike | undefined;
    if (!ac) return [];
    const out: AgentProposal[] = [];
    for (const m of (ac.blocked ?? []).slice(0, 4)) out.push({
      kind: "recommendation", title: `שחרר חסימה: ${label(m)}`, reason: "משימה חסומה מעכבת ביצוע",
      evidence: [`ישות: ${m.entityName ?? "—"}`, "סטטוס: חסום"], confidence: 70, impact: "high", urgency: Math.min(100, (m.priority ?? 60) + 10),
      entityType: "mission", entityId: m.id, entityName: m.entityName ?? undefined, ifIgnored: "ההחלטה לא תמומש",
    });
    for (const m of (ac.waiting ?? []).slice(0, 4)) out.push({
      kind: "recommendation", title: `אשר משימה ממתינה: ${label(m)}`, reason: "משימה ממתינה לאישור",
      evidence: [`ישות: ${m.entityName ?? "—"}`, "סטטוס: ממתין"], confidence: 68, impact: "medium", urgency: m.priority ?? 55,
      entityType: "mission", entityId: m.id, entityName: m.entityName ?? undefined, ifIgnored: "עיכוב בהזדמנות",
    });
    for (const m of (ac.critical ?? []).slice(0, 2)) out.push({
      kind: "mission", title: `צור משימת מעקב ל: ${label(m)}`, reason: "משימה קריטית ללא התקדמות",
      evidence: [`עדיפות ${m.priority ?? 80}`], confidence: 65, impact: "high", urgency: m.priority ?? 80,
      entityType: "mission", entityId: m.id, entityName: m.entityName ?? undefined, missionType: "AGENT_FOLLOWUP",
      ifIgnored: "המשימה הקריטית עלולה להיתקע", alternatives: ["הקצה אחראי", "העלה עדיפות"],
    });
    return out;
  },
};
