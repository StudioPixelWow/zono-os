// ============================================================================
// 📅 ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle service (server-only).
// The meetings table previously supported CREATE only (confirmBooking) with the
// status frozen at 'scheduled'. This adds the missing lifecycle transitions —
// reschedule / cancel / complete (+outcome, +optional follow-up task) / no-show —
// each of which writes the canonical meetings row AND records a unified-timeline
// activity. No auto-send / auto-book; every transition is an explicit action.
// Events are direct today; they will be re-emitted through the kernel in Stage 1.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logMeetingLifecycle } from "@/lib/activity/service";
import { EVENT_TYPES } from "@/lib/activity/types";

type Row = Record<string, unknown>;
const MEETING_COLS = "id,org_id,title,status,start_at,end_at,type,buyer_id,seller_id,lead_id,property_id,deal_id";

export interface MeetingActionResult { ok: boolean; error?: string; followUpTaskId?: string }

async function loadMeeting(db: Awaited<ReturnType<typeof createClient>>, orgId: string, meetingId: string): Promise<Row | null> {
  const { data } = await db.from("meetings").select(MEETING_COLS).eq("id", meetingId).eq("org_id", orgId).maybeSingle();
  return (data as Row | null) ?? null;
}

async function ctx(): Promise<{ orgId: string | null; userId: string | null }> {
  const sc = await getSessionContext();
  return { orgId: sc.profile?.org_id ?? null, userId: sc.user?.id ?? null };
}

function meetingRef(m: Row) {
  return {
    id: String(m.id),
    title: (typeof m.title === "string" && m.title) || "פגישה",
    property_id: (m.property_id as string | null) ?? null,
    buyer_id: (m.buyer_id as string | null) ?? null,
    seller_id: (m.seller_id as string | null) ?? null,
    lead_id: (m.lead_id as string | null) ?? null,
  };
}

/** Move a scheduled meeting to a new time. Status stays schedulable; logs a reschedule. */
export async function rescheduleMeeting(meetingId: string, startAt: string, endAt?: string | null): Promise<MeetingActionResult> {
  const { orgId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  if (!startAt) return { ok: false, error: "חסר מועד חדש." };
  try {
    const db = await createClient();
    const m = await loadMeeting(db, orgId, meetingId);
    if (!m) return { ok: false, error: "הפגישה לא נמצאה." };
    const { error } = await db.from("meetings")
      .update({ start_at: startAt, end_at: endAt ?? null, status: "scheduled" } as never)
      .eq("id", meetingId).eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    await logMeetingLifecycle(EVENT_TYPES.meetingRescheduled, meetingRef(m), `הפגישה נדחתה: ${meetingRef(m).title}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "הדחייה נכשלה." }; }
}

/** Cancel a meeting (records an optional reason). */
export async function cancelMeeting(meetingId: string, reason?: string | null): Promise<MeetingActionResult> {
  const { orgId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  try {
    const db = await createClient();
    const m = await loadMeeting(db, orgId, meetingId);
    if (!m) return { ok: false, error: "הפגישה לא נמצאה." };
    const { error } = await db.from("meetings")
      .update({ status: "cancelled", cancellation_reason: reason ?? null } as never)
      .eq("id", meetingId).eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    await logMeetingLifecycle(EVENT_TYPES.meetingCancelled, meetingRef(m), `הפגישה בוטלה: ${meetingRef(m).title}`, reason ?? null);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "הביטול נכשל." }; }
}

/** Mark a no-show. */
export async function markNoShow(meetingId: string, note?: string | null): Promise<MeetingActionResult> {
  const { orgId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  try {
    const db = await createClient();
    const m = await loadMeeting(db, orgId, meetingId);
    if (!m) return { ok: false, error: "הפגישה לא נמצאה." };
    const { error } = await db.from("meetings")
      .update({ status: "no_show", outcome: note ?? null } as never)
      .eq("id", meetingId).eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    await logMeetingLifecycle(EVENT_TYPES.meetingNoShow, meetingRef(m), `הלקוח לא הגיע: ${meetingRef(m).title}`, note ?? null);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "העדכון נכשל." }; }
}

/** Complete a meeting, capturing an outcome; optionally spawn a follow-up task on the same entity. */
export async function completeMeeting(
  meetingId: string,
  input: { outcome?: string | null; followUpTitle?: string | null; followUpDueAt?: string | null },
): Promise<MeetingActionResult> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  try {
    const db = await createClient();
    const m = await loadMeeting(db, orgId, meetingId);
    if (!m) return { ok: false, error: "הפגישה לא נמצאה." };

    // Optional follow-up task on the same entity (reuses the canonical tasks table).
    let followUpTaskId: string | undefined;
    const followTitle = input.followUpTitle?.trim();
    if (followTitle) {
      const taskRow: Row = {
        org_id: orgId, created_by: userId, assignee_id: userId, title: followTitle,
        priority: "medium", status: "todo", due_at: input.followUpDueAt || null,
        buyer_id: m.buyer_id ?? null, seller_id: m.seller_id ?? null,
        lead_id: m.lead_id ?? null, property_id: m.property_id ?? null,
      };
      const { data: task } = await db.from("tasks").insert(taskRow as never).select("id").maybeSingle();
      followUpTaskId = (task as { id?: string } | null)?.id;
    }

    const { error } = await db.from("meetings")
      .update({ status: "completed", completed_at: new Date().toISOString(), outcome: input.outcome ?? null, follow_up_task_id: followUpTaskId ?? null } as never)
      .eq("id", meetingId).eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };

    await logMeetingLifecycle(EVENT_TYPES.meetingCompleted, meetingRef(m), `הפגישה הושלמה: ${meetingRef(m).title}`, input.outcome ?? null);
    return { ok: true, followUpTaskId };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "עדכון הפגישה נכשל." }; }
}
