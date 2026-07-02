// ============================================================================
// 🧠 ZONO Organizational Memory™ — service (server-only). 27.8.
// Harvests REAL memory events from already-persisted mission history (via the
// Mission Action Center, read-only), then builds the timeline, success/failure
// patterns, learning objects, decision improvements, Chief-of-Staff answers and
// executive memory. Evidence-only; no schema changes; no engine modified.
// ============================================================================
import "server-only";
import { getActionCenter, type Mission } from "../mission-engine";
import { deriveEventsFromMissions, type MissionLike } from "./events";
import { buildTimeline } from "./timeline";
import { detectSuccessPatterns, detectFailurePatterns } from "./patterns";
import { patternsToLearnings } from "./learning";
import { buildDecisionImprovements } from "./decision-improvement";
import { buildChiefOfStaffAnswers } from "./chief-of-staff";
import { buildExecutiveMemory } from "./executive-memory";
import { ORG_MEMORY_VERSION, type OrgMemoryReport, type MemoryEvent } from "./types";

const toMissionLike = (m: Mission): MissionLike => ({
  id: m.id, missionType: m.missionType, entityType: m.entityType, entityId: m.entityId, entityName: m.entityName,
  status: m.status, businessImpact: m.businessImpact, reason: m.reason, evidence: m.evidence,
  createdAt: m.createdAt, completedAt: m.completedAt, history: m.history,
});

/** The unified Organizational Memory report. Read-only over mission history. */
export async function getOrgMemoryReport(orgId: string | null): Promise<OrgMemoryReport> {
  const notes: string[] = [];
  let missions: MissionLike[] = [];
  try {
    const ac = await getActionCenter(orgId);
    if (ac.notes?.length) notes.push(...ac.notes);
    const union = new Map<string, Mission>();
    for (const bucket of [ac.completed, ac.recentlyCreated, ac.critical, ac.highPriority, ac.inProgress, ac.blocked, ac.waiting, ac.upcoming, ac.todaysMissions]) {
      for (const m of bucket) if (!union.has(m.id)) union.set(m.id, m);
    }
    missions = [...union.values()].map(toMissionLike);
  } catch { notes.push("לא ניתן לטעון היסטוריית משימות — הזיכרון הארגוני ריק עד שייווצרו משימות."); }

  const events: MemoryEvent[] = deriveEventsFromMissions(missions);
  const timeline = buildTimeline(events);
  const successPatterns = detectSuccessPatterns(events);
  const failurePatterns = detectFailurePatterns(events);
  const learnings = patternsToLearnings([...successPatterns, ...failurePatterns]);
  const decisionImprovements = buildDecisionImprovements(learnings);
  const chiefOfStaffAnswers = buildChiefOfStaffAnswers(successPatterns, failurePatterns, learnings);
  const executiveMemory = buildExecutiveMemory(successPatterns, failurePatterns, learnings);

  if (!events.length) notes.push("אין עדיין אירועי זיכרון — צור והשלם/בטל משימות כדי לבנות זיכרון ארגוני. אין המצאות.");

  const successes = events.filter((e) => e.outcome === "success").length;
  const failures = events.filter((e) => e.outcome === "failure").length;

  return {
    version: ORG_MEMORY_VERSION, orgId, generatedAt: new Date().toISOString(),
    totals: { events: events.length, successes, failures, neutral: events.length - successes - failures },
    timeline: timeline.slice(0, 40),
    successPatterns, failurePatterns, learnings,
    decisionImprovements, chiefOfStaffAnswers, executiveMemory, notes,
  };
}
