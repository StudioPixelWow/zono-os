"use server";
// ============================================================================
// 🗓️ ZONO — Calendar OS™ · server actions. PHASE 43.0.
// READ + PROPOSE only. No writes, no auto-change — reschedule/route are
// suggestions the broker approves in the source system.
// ============================================================================
import {
  getCalendarEvents, getDayPlan, getEntityCalendar, getOfficeCalendar, getTeamAvailability,
  proposeRescheduleFor, optimizeRouteFor, getProviderStatuses, answerCalendarQuestion,
} from "./service";
import type {
  CalendarEvent, DayPlan, RescheduleProposal, RescheduleTrigger, OptimizedRoute,
  BrokerAvailability, EntityKind, CalendarProviderStatus,
} from "./types";
import type { CalendarAsk } from "./service";

export async function getCalendarAction(input: { startIso: string; endIso: string; brokerId?: string | null }): Promise<{ events: CalendarEvent[] }> {
  return { events: await getCalendarEvents(input) };
}
export async function getDayPlanAction(input: { dateIso: string; brokerId?: string | null }): Promise<{ plan: DayPlan }> {
  return { plan: await getDayPlan(input.dateIso, input.brokerId ?? null) };
}
export async function getEntityCalendarAction(input: { kind: EntityKind; id: string }): Promise<{ events: CalendarEvent[] }> {
  return { events: await getEntityCalendar(input.kind, input.id) };
}
export async function getOfficeCalendarAction(input: { startIso: string; endIso: string }): Promise<{ events: CalendarEvent[] }> {
  return { events: await getOfficeCalendar(input.startIso, input.endIso) };
}
export async function getTeamAvailabilityAction(): Promise<{ team: BrokerAvailability[] }> {
  return { team: await getTeamAvailability() };
}
export async function proposeRescheduleAction(input: { trigger: RescheduleTrigger; brokerId?: string | null; dateIso?: string }): Promise<{ proposal: RescheduleProposal }> {
  return { proposal: await proposeRescheduleFor(input.trigger, input.brokerId ?? null, input.dateIso) };
}
export async function optimizeRouteAction(input: { dateIso: string; brokerId?: string | null }): Promise<{ route: OptimizedRoute }> {
  return { route: await optimizeRouteFor(input.dateIso, input.brokerId ?? null) };
}
export async function getCalendarProvidersAction(): Promise<{ providers: CalendarProviderStatus[] }> {
  return { providers: getProviderStatuses() };
}
export async function askCalendarAction(question: string): Promise<{ result: CalendarAsk }> {
  return { result: await answerCalendarQuestion(question) };
}
