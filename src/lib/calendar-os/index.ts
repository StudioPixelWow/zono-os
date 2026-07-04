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
// 43.2 — connectors foundation + availability + booking.
export * from "./connectors";
export { DEFAULT_PREFS, mergePrefs, frameFromPrefs, isWorkingTime, type AvailabilityPrefs, type BlockedTime } from "./availability";
export { generateBookingSlots, BOOKING_HE, BOOKING_MEETING_TYPE, runBookingSelfCheck, type BookingKind, type BookingSlot } from "./booking";
export {
  getAvailabilityPrefs, saveAvailabilityPrefs, proposeBooking, confirmBooking, getConnectorHealth,
  type BookingProposal, type ConfirmBookingInput, type ConfirmBookingResult,
} from "./booking-service";
