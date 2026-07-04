// 🗓️ ZONO — Calendar OS™ barrel. The single scheduling engine (foundation).
export * from "./types";
export * from "./engine";
export { runSelfCheck } from "./qa";
export {
  getCalendarEvents, getDayPlan, getEntityCalendar, getOfficeCalendar,
  getTeamAvailability, proposeRescheduleFor, optimizeRouteFor, getProviderStatuses,
  answerCalendarQuestion, type CalendarQuery, type CalendarAsk,
} from "./service";
