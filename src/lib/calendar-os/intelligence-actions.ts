"use server";
// ============================================================================
// 🧠 ZONO — Calendar Intelligence™ · server actions. PHASE 43.1.
// READ-ONLY recommendations. Nothing mutates a schedule.
// ============================================================================
import {
  getDayIntelligence, getWeekIntelligence, getVisitPrep, getMeetingPrep, getManagerView,
  type DayIntelligence, type WeekIntelligence, type VisitPrep, type MeetingPrep,
} from "./intelligence-service";
import type { ManagerView } from "./intelligence";
import type { EntityKind } from "./types";

export async function getDayIntelligenceAction(input: { dateIso: string; brokerId?: string | null }): Promise<{ intel: DayIntelligence }> {
  return { intel: await getDayIntelligence(input.dateIso, input.brokerId ?? null) };
}
export async function getWeekIntelligenceAction(input: { fromIso?: string } = {}): Promise<{ intel: WeekIntelligence }> {
  return { intel: await getWeekIntelligence(input.fromIso) };
}
export async function getVisitPrepAction(input: { propertyId: string }): Promise<{ prep: VisitPrep | null }> {
  return { prep: await getVisitPrep(input.propertyId) };
}
export async function getMeetingPrepAction(input: { kind: EntityKind; id: string }): Promise<{ prep: MeetingPrep }> {
  return { prep: await getMeetingPrep(input.kind, input.id) };
}
export async function getManagerViewAction(): Promise<{ view: ManagerView }> {
  return { view: await getManagerView() };
}
