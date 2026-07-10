"use server";
// ============================================================================
// 📅 ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle actions (thin adapters).
// Each is an EXPLICIT broker action (no auto-transition). Revalidates the
// calendar + daily surfaces so the new status/outcome shows immediately.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  rescheduleMeeting, cancelMeeting, markNoShow, completeMeeting,
  type MeetingActionResult,
} from "./meeting-lifecycle-service";

function revalidate() {
  revalidatePath("/calendar");
  revalidatePath("/today");
}

export async function rescheduleMeetingAction(meetingId: string, startAt: string, endAt?: string | null): Promise<MeetingActionResult> {
  const r = await rescheduleMeeting(meetingId, startAt, endAt);
  if (r.ok) revalidate();
  return r;
}

export async function cancelMeetingAction(meetingId: string, reason?: string | null): Promise<MeetingActionResult> {
  const r = await cancelMeeting(meetingId, reason);
  if (r.ok) revalidate();
  return r;
}

export async function markNoShowAction(meetingId: string, note?: string | null): Promise<MeetingActionResult> {
  const r = await markNoShow(meetingId, note);
  if (r.ok) revalidate();
  return r;
}

export async function completeMeetingAction(
  meetingId: string,
  input: { outcome?: string | null; followUpTitle?: string | null; followUpDueAt?: string | null },
): Promise<MeetingActionResult> {
  const r = await completeMeeting(meetingId, input);
  if (r.ok) revalidate();
  return r;
}
