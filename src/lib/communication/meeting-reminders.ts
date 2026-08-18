/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Communication Automation: MEETING REMINDER scheduler (server-only).
// Reuses the existing `meetings` table — no second reminder table. Finds meetings
// entering the reminder window and emits exactly ONE reminder domain event each,
// which the orchestrator then routes per preference. Idempotency identity is
// meeting.reminder:<id>:<start_at-minute> — so a cron re-run does not repeat, a
// reschedule (new start_at) produces a correct new reminder, and cancelled /
// completed meetings emit nothing.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";

const LEAD_MIN = 120; // one reminder ~2h before an upcoming meeting
const TERMINAL = new Set(["cancelled", "completed", "no_show"]);
const TIME_FMT = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export async function scanMeetingReminders(): Promise<{ scanned: number; emitted: number }> {
  const db: any = createServiceRoleClient();
  const now = Date.now();
  const fromIso = new Date(now).toISOString();
  const toIso = new Date(now + LEAD_MIN * 60_000).toISOString();

  const { data } = await db.from("meetings")
    .select("id,org_id,organizer_id,title,start_at,status,all_day")
    .gte("start_at", fromIso).lte("start_at", toIso)
    .limit(500);
  const rows = (data ?? []) as any[];

  let emitted = 0;
  for (const m of rows) {
    if (m.all_day || !m.organizer_id || !m.start_at) continue;
    if (TERMINAL.has(String(m.status))) continue;
    const whenHe = TIME_FMT.format(new Date(m.start_at));
    const res = await emitBusinessEvent({
      type: DOMAIN_EVENTS.meetingReminder, entityType: "meeting", entityId: m.id, orgId: m.org_id,
      actorUserId: m.organizer_id,
      payload: { when: whenHe, title: m.title ?? null },
      idempotencyKey: `meeting.reminder:${m.id}:${String(m.start_at).slice(0, 16)}`,
    });
    if (res.ok && !res.deduped) emitted++;
  }
  return { scanned: rows.length, emitted };
}
