// ============================================================================
// 🔔 AI Follow-up Engine + Explainability (pure). Phase 27.5 · Part 9/11.
// Recommendation-only follow-up suggestions from a mission's status + age, and
// the mission explainability block. Deterministic. No DB, no AI, no execution.
// ============================================================================
import { expectedRoi } from "./templates";
import type { Impact, Mission, MissionType, ExecStatus } from "./types";

const DAY = 86400000;
const ageDays = (iso: string, nowMs: number): number => Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / DAY));

/** Follow-up suggestions for a mission (never auto-acts). */
export function suggestFollowUps(m: Pick<Mission, "status" | "updatedAt" | "tasks">, nowMs = Date.now()): string[] {
  const out: string[] = [];
  const age = ageDays(m.updatedAt, nowMs);
  if (m.status === "WAITING_FOR_APPROVAL" && age >= 3) out.push(`ממתין לאישור ${age} ימים — הגבר דחיפות או אשר.`);
  if (m.status === "READY" && age >= 2) out.push("מוכן לביצוע — מומלץ להתחיל.");
  if (m.status === "IN_PROGRESS" && age >= 3) out.push(`אין התקדמות ${age} ימים — מומלץ מעקב.`);
  if (m.status === "WAITING_FOR_DATA") out.push("ממתין לנתונים — השלם שיוך/מחקר ואז חדש.");
  if (m.status === "IN_PROGRESS" && m.tasks.length > 0 && m.tasks.every((t) => t.status === "DONE")) out.push("כל המשימות הושלמו — מומלץ לסגור את המשימה.");
  if (m.status === "DONE") out.push("הושלם — קבע צעד המשך / משימה חדשה.");
  if (m.status === "CANCELLED") out.push("בוטל — אם הראיות עדיין תקפות, שקול פתיחה מחדש.");
  return out;
}

const IF_IGNORED: Record<Impact, string> = {
  high: "החמצת הזדמנות משמעותית / סיכון לאובדן נתח שוק.",
  medium: "האטת צמיחה או החמצת שיפור מדיד.",
  low: "השפעה מוגבלת — אך שיפור תפעולי יאבד.",
};

export function ifIgnoredText(impact: Impact, priority: number): string {
  if (priority >= 75) return IF_IGNORED.high;
  return IF_IGNORED[impact];
}

export function buildExplain(args: { why: string; fromDecision: string | null; businessImpact: Impact; confidence: number; priority: number; missionType: MissionType }) {
  return {
    why: args.why,
    fromDecision: args.fromDecision,
    businessImpact: args.businessImpact,
    expectedRoi: expectedRoi(args.missionType),
    confidence: args.confidence,
    ifIgnored: ifIgnoredText(args.businessImpact, args.priority),
  };
}

/** Statuses that count as "active" (open work). */
export const ACTIVE_STATUSES: ExecStatus[] = ["READY", "WAITING_FOR_DATA", "WAITING_FOR_APPROVAL", "BLOCKED", "IN_PROGRESS"];
