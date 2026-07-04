// 🗓️ ZONO — Calendar OS™ barrel. The single scheduling engine (foundation).
export * from "./types";
export * from "./engine";
export { runSelfCheck } from "./qa";
export {
  getCalendarEvents, getDayPlan, getEntityCalendar, getOfficeCalendar,
  getTeamAvailability, proposeRescheduleFor, optimizeRouteFor, getProviderStatuses,
  answerCalendarQuestion, type CalendarQuery, type CalendarAsk,
} from "./service";
// 43.1 — Calendar Intelligence (recommendation-only layer over Calendar OS).
export {
  nextBestActions, optimizeDay, buildWeekPlan, findFreeSlots, smartRouting,
  calendarHealth, afterMeetingSuggestions, managerWorkload, classifyCalendarIntent,
  runIntelSelfCheck, DEFAULT_FRAME,
} from "./intelligence";
export {
  getDayIntelligence, getWeekIntelligence, getVisitPrep, getMeetingPrep, getManagerView, buildSignals,
} from "./intelligence-service";
