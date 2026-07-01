// ============================================================================
// 🚀 ZONO Universal Mission Engine™ & Action Execution Layer — public surface. 27.5.
// Turns Decisions into executable, entity-agnostic Missions → Tasks with
// follow-up + an Action Center. Nothing auto-executes; evidence-only. Reuses the
// Decision Engine (read-only). No valuation / discovery / decision-engine changes.
// ============================================================================
export {
  createMission, createTasksFromMission, completeMission, cancelMission, updateMissionStatus,
  recalculateMission, linkMissionToEntity, listEntityMissions, generateMissionsFromOfficeDecisions,
  getActionCenter, type MissionResult,
} from "./service";
export { generateTasks, templateFor, missionTitle, expectedRoi, defaultGoal } from "./templates";
export { missionTypeFromDecision, decisionToMissionInput } from "./decision-bridge";
export { suggestFollowUps, buildExplain, ifIgnoredText, ACTIVE_STATUSES } from "./followup";
export { runSelfCheck, type MESelfCheck, type MECheck } from "./qa";
export { MISSION_ENGINE_VERSION, EXEC_STATUS_HE } from "./types";
export type {
  EntityType, MissionType, ExecStatus, Impact, MissionTask, MissionHistoryEntry, Mission,
  CreateMissionInput, ActionCenter,
} from "./types";
