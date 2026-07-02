// ============================================================================
// ✅ Organizational Memory — self-tests (pure, offline). Phase 27.8. Part 10.
// Scenarios: repeated success, repeated failure, mixed outcomes, no history,
// growing organization, declining organization — plus decision improvement,
// Chief-of-Staff answers and executive memory.
// ============================================================================
import { deriveEventsFromMissions, type MissionLike } from "./events";
import { buildTimeline } from "./timeline";
import { detectSuccessPatterns, detectFailurePatterns } from "./patterns";
import { patternsToLearnings } from "./learning";
import { buildDecisionImprovements, applyImprovementsToDecisions } from "./decision-improvement";
import { buildChiefOfStaffAnswers, weTriedThisBefore } from "./chief-of-staff";
import { buildExecutiveMemory } from "./executive-memory";
import type { Impact } from "./types";

export interface OMCheck { name: string; pass: boolean; detail: string }
export interface OMSelfCheck { ok: boolean; total: number; passed: number; checks: OMCheck[] }

const DAY = 86400000;
const NOW = Date.UTC(2026, 6, 2);
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();
let _id = 0;
const mission = (missionType: string, terminal: "completed" | "cancelled" | "none", entityName: string, daysAgo: number, impact: Impact = "medium"): MissionLike => {
  const id = `M${++_id}`;
  const history: MissionLike["history"] = [{ at: iso(daysAgo + 5), event: "created", detail: "מהחלטה" }];
  if (terminal === "completed") history.push({ at: iso(daysAgo), event: "completed", detail: "הצלחה" });
  if (terminal === "cancelled") history.push({ at: iso(daysAgo), event: "cancelled", detail: "כשל" });
  return {
    id, missionType, entityType: "office", entityId: `o-${entityName}`, entityName,
    status: terminal === "completed" ? "DONE" : terminal === "cancelled" ? "CANCELLED" : "IN_PROGRESS",
    businessImpact: impact, reason: `סיבה ${missionType}`, evidence: [`ראיה ${missionType}`],
    createdAt: iso(daysAgo + 5), completedAt: terminal === "none" ? null : iso(daysAgo), history,
  };
};

export function runSelfCheck(): OMSelfCheck {
  const checks: OMCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ── Repeated success ────────────────────────────────────────────────────────
  const successMissions = [
    mission("MARKETING_CAMPAIGN", "completed", "RE/MAX Smart", 10, "high"),
    mission("MARKETING_CAMPAIGN", "completed", "RE/MAX Smart", 25, "high"),
    mission("MARKETING_CAMPAIGN", "completed", "RE/MAX Family", 40, "medium"),
  ];
  const sEvents = deriveEventsFromMissions(successMissions);
  const sSucc = detectSuccessPatterns(sEvents);
  const sLearn = patternsToLearnings(sSucc);
  add("success events derived", sEvents.filter((e) => e.outcome === "success").length === 3, `${sEvents.length}`);
  add("campaign success semantic", sEvents.some((e) => e.type === "campaign_succeeded"), "");
  add("repeated success pattern", sSucc.some((p) => p.key === "cat:MARKETING_CAMPAIGN" && p.occurrences === 3), "");
  add("success learning + recommendation", sLearn.length > 0 && sLearn[0].recommendation.length > 0 && sLearn[0].confidence > 0, "");
  add("learning has cases + why", sLearn[0].cases.length > 0 && sLearn[0].why.length > 0, "");

  // ── Repeated failure ────────────────────────────────────────────────────────
  const failMissions = [
    mission("RECRUIT_BROKER", "cancelled", "Office Weak", 5),
    mission("RECRUIT_BROKER", "cancelled", "Office Weak", 30),
    mission("RECRUIT_BROKER", "cancelled", "Office Weak", 60),
  ];
  const fEvents = deriveEventsFromMissions(failMissions);
  const fFail = detectFailurePatterns(fEvents);
  add("failure events + semantic", fEvents.filter((e) => e.outcome === "failure").length === 3 && fEvents.some((e) => e.type === "broker_left"), "");
  add("repeated failure by category", fFail.some((p) => p.key === "cat:RECRUIT_BROKER" && p.occurrences === 3), "");
  add("repeated failure by entity", fFail.some((p) => p.key === "ent:Office Weak"), "");
  const fLearn = patternsToLearnings(fFail);
  add("failure learning caution recommendation", fLearn.some((l) => /בחן מחדש|התערב/.test(l.recommendation)), "");

  // ── Mixed outcomes ──────────────────────────────────────────────────────────
  const mixed = deriveEventsFromMissions([...successMissions, ...failMissions]);
  add("mixed → both pattern kinds", detectSuccessPatterns(mixed).length > 0 && detectFailurePatterns(mixed).length > 0, "");
  add("timeline sorted desc", (() => { const t = buildTimeline(mixed); return t.every((e, i) => i === 0 || t[i - 1].at >= e.at); })(), "");
  add("timeline entries have entity+reason+evidence", buildTimeline(mixed).every((e) => e.entity && e.reason !== undefined && Array.isArray(e.evidence)), "");

  // ── No history ──────────────────────────────────────────────────────────────
  const none = deriveEventsFromMissions([mission("SELLER_OPPORTUNITY", "none", "Office X", 3)]);
  add("no terminal → no patterns", detectSuccessPatterns(none).length === 0 && detectFailurePatterns(none).length === 0, `${none.length}`);
  add("empty missions → empty", deriveEventsFromMissions([]).length === 0, "");
  const emptyAnswers = buildChiefOfStaffAnswers([], [], []);
  add("no history → CoS says insufficient", emptyAnswers[0].answer.includes("אין היסטוריה") && emptyAnswers[0].confidence === 0, "");

  // ── Growing organization (successes dominate) ───────────────────────────────
  const growLearn = patternsToLearnings(detectSuccessPatterns(sEvents));
  const growImprovements = buildDecisionImprovements(growLearn);
  add("growing → boost decision", growImprovements.some((i) => i.direction === "boost" && i.category === "MARKETING" && i.delta > 0), "");
  const applied = applyImprovementsToDecisions([{ category: "MARKETING", priorityScore: 60 }], growImprovements);
  add("boost raises priority + note", applied[0].adjustedPriority > 60 && applied[0].memoryNote !== null, `${applied[0].adjustedPriority}`);

  // ── Declining organization (failures dominate) ──────────────────────────────
  const declImprovements = buildDecisionImprovements(fLearn);
  add("declining → caution decision", declImprovements.some((i) => i.direction === "caution" && i.category === "BROKERAGE" && i.delta < 0), "");
  const cautioned = applyImprovementsToDecisions([{ category: "BROKERAGE", priorityScore: 60 }], declImprovements);
  add("caution lowers priority", cautioned[0].adjustedPriority < 60, `${cautioned[0].adjustedPriority}`);

  // ── Chief of Staff answers grounded ─────────────────────────────────────────
  const answers = buildChiefOfStaffAnswers(detectSuccessPatterns(mixed), detectFailurePatterns(mixed), patternsToLearnings([...detectSuccessPatterns(mixed), ...detectFailurePatterns(mixed)]));
  add("CoS 'tried before' grounded", answers[0].answer.startsWith("כן") && answers[0].confidence > 0, "");
  add("CoS repeats-mistake office", answers.some((a) => /חוזר על אותה טעות/.test(a.answer)), "");
  add("weTriedThisBefore lookup", weTriedThisBefore("MARKETING_CAMPAIGN", detectSuccessPatterns(mixed)).answer.startsWith("כן"), "");

  // ── Executive memory ────────────────────────────────────────────────────────
  const allPatternsS = detectSuccessPatterns(mixed), allPatternsF = detectFailurePatterns(mixed);
  const exec = buildExecutiveMemory(allPatternsS, allPatternsF, patternsToLearnings([...allPatternsS, ...allPatternsF]));
  add("executive top successes + failures", exec.topSuccesses.length > 0 && exec.topFailures.length > 0, "");
  add("executive improvements + problems", exec.biggestImprovements.length > 0 && exec.recurringProblems.length > 0, "");
  add("executive lessons learned", exec.lessonsLearned.length > 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
