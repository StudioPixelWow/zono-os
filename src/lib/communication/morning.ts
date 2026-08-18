/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Communication Automation: MORNING BRIEF email (server-only). Reuses the
// Follow-up engine's SERVICE-ROLE state loader (no session, no second daily
// calculation) to build each agent's personal "על הבוקר" and email it via the
// same dispatch/dedup path. Workday-morning gated (Asia/Jerusalem). Idempotent:
// one brief per user per calendar day. Never WhatsApp — email only.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadOrgFollowUpStatesService } from "@/lib/follow-up/service";
import { renderTemplate, withDeepLink } from "./templates";
import { normalizePrefs } from "./orchestrator";
import { dispatchExternal } from "./dispatch";
import { localHour } from "./quiet-hours";
import type { DeliveryRequest } from "@/lib/notify/types";

function base(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
}
function israelDow(nowIso: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date(nowIso));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}
/** ~08:00 on an Israeli workday (Sun–Thu). The cron may fire at two UTC hours to
 * cover DST; this gate makes exactly one of them send. */
export function isMorningWindow(nowIso: string): boolean {
  const dow = israelDow(nowIso);
  return localHour(nowIso, "Asia/Jerusalem") === 8 && dow >= 0 && dow <= 4;
}

const ATTENTION = new Set(["new_waiting", "followup_overdue", "needs_action", "unassigned"]);

export async function sendMorningBriefs(opts?: { orgLimit?: number }): Promise<{ orgs: number; users: number; sent: number }> {
  const db: any = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const day = nowIso.slice(0, 10);

  const { data: userRows } = await db.from("users")
    .select("id,org_id,full_name,email,notification_preferences,status")
    .eq("status", "active").not("email", "is", null).limit(4000);
  const users = (userRows ?? []) as any[];

  const byOrg = new Map<string, any[]>();
  for (const u of users) { if (!u.org_id) continue; const a = byOrg.get(u.org_id) ?? []; a.push(u); byOrg.set(u.org_id, a); }

  let orgs = 0, seen = 0, sent = 0;
  const orgIds = [...byOrg.keys()].slice(0, opts?.orgLimit ?? 200);
  for (const orgId of orgIds) {
    orgs++;
    let states: any[] = [];
    try { states = await loadOrgFollowUpStatesService(orgId, 500); } catch { /* degrade */ }
    for (const u of byOrg.get(orgId) ?? []) {
      const prefs = normalizePrefs(u.notification_preferences);
      if (!prefs.email || !prefs.morningEmail) continue;
      seen++;
      const mine = states.filter((s) => s.assignedUserId === u.id && ATTENTION.has(s.state));
      const lines = mine.slice(0, 6).map((s) => `${s.leadName ?? "ליד"} — ${s.reason}`);
      const first = ((u.full_name ?? "") as string).trim().split(/\s+/)[0] || null;
      const msg = renderTemplate("MORNING_BRIEF", { firstName: first, lines });
      const em = withDeepLink(msg, "/", base());
      const req: DeliveryRequest = {
        orgId, userId: u.id, channel: "email", to: u.email,
        title: em.title, body: em.body, dedupKey: `morning_brief:${u.id}:${day}`,
      };
      const res = await dispatchExternal(db, "email", req, { scheduledAt: null });
      if (res.sent) sent++;
    }
  }
  return { orgs, users: seen, sent };
}
