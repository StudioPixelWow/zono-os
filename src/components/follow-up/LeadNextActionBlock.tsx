// ============================================================================
// ZONO — Lead follow-up "next action" block. A prominent, restrained banner at
// the top of the lead workspace answering: what's the next action, when, what's
// the status, and why (if overdue). Derived from the canonical follow-up state
// (getLeadFollowUpState) — never a duplicate calculation. Server component;
// renders nothing when there is no state or the lead is closed.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getLeadFollowUpState } from "@/lib/follow-up/service";
import type { FollowUpCustomerState } from "@/lib/follow-up/state";

const TIME_FMT = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const whenHe = (iso: string | null) => (iso ? TIME_FMT.format(new Date(iso)) : null);

const TONE: Record<FollowUpCustomerState, string> = {
  new_waiting: "border-amber-500/30 bg-amber-500/[0.07] text-amber-300",
  in_progress: "border-line bg-card text-ink",
  awaiting_followup: "border-line bg-card text-ink",
  followup_overdue: "border-rose-500/30 bg-rose-500/[0.08] text-rose-300",
  meeting_scheduled: "border-line bg-card text-ink",
  needs_action: "border-amber-500/30 bg-amber-500/[0.07] text-amber-300",
  unassigned: "border-rose-500/30 bg-rose-500/[0.08] text-rose-300",
  closed: "border-line bg-card text-muted",
};
const ICON: Record<FollowUpCustomerState, string> = {
  new_waiting: "PhoneCall", in_progress: "CheckSquare", awaiting_followup: "Clock",
  followup_overdue: "AlertTriangle", meeting_scheduled: "Calendar", needs_action: "Flag",
  unassigned: "UserPlus", closed: "CheckCircle",
};

export async function LeadNextActionBlock({ leadId }: { leadId: string }) {
  let st;
  try { st = await getLeadFollowUpState(leadId); } catch { return null; }
  if (!st || st.state === "closed") return null;

  const when = whenHe(st.nextActionAt);
  return (
    <div dir="rtl" className={`mb-3 rounded-2xl border p-4 ${TONE[st.state]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-card/70 grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={ICON[st.state]} size={20} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-card/70 px-2 py-0.5 text-[11px] font-black">{st.label}</span>
              {st.hot && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">חם</span>}
            </div>
            <p className="text-ink mt-1 text-sm font-extrabold">
              {st.nextAction ? st.nextAction.title : "אין פעולה הבאה מוגדרת"}
              {when && <span className="text-muted font-semibold"> · {when}</span>}
            </p>
            <p className="text-muted text-xs">{st.reason}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {st.nextAction
            ? <Link href="/today" className="bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white">לפעולה</Link>
            : <Link href="/today" className="bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white">צור פעולה</Link>}
        </div>
      </div>
    </div>
  );
}
