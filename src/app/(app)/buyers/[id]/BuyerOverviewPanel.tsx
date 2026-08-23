"use client";
// ============================================================================
// Buyer Command Center 5.1 — the "סקירה" (overview) tab. The default first viewport:
// ONE evidence-backed next action, new-matches, shortlist state, buyer activity,
// next appointment, last communication — not an equal-weight widget wall.
// ============================================================================
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import type { BuyerMatchOverview } from "@/lib/matching-intelligence/buyer-matches-overview";
import { markBuyerMatchesReviewedAction } from "@/lib/matching-intelligence/buyer-overview-actions";

type ActivityLike = { id: string; subject: string | null; type: string; body: string | null; occurred_at: string | null };
type MeetingLike = { id: string; title: string; start_at: string | null; status: string };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const fmtDateTime = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

export function BuyerOverviewPanel({
  buyerId, overview, activities, meetings, onNavigate, waHref, phone, nowIso,
}: {
  buyerId: string;
  overview: BuyerMatchOverview | null;
  activities: ActivityLike[];
  meetings: MeetingLike[];
  onNavigate: (tab: "matching" | "shortlist" | "calendar" | "communication") => void;
  waHref: string | null;
  phone: string | null;
  nowIso: string;   // server-rendered timestamp — keeps this render pure (no client clock)
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const c = overview?.counts;
  const nextMeeting = meetings
    .filter((m) => m.start_at && m.start_at >= nowIso && (m.status === "scheduled" || m.status === "confirmed"))
    .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""))[0] ?? null;
  const lastComm = activities.find((a) => (a.type ?? "").startsWith("communication") || /whatsapp|מייל|שיחה|הודעה/.test(a.subject ?? "")) ?? activities[0] ?? null;

  const actionTarget: Record<string, "matching" | "shortlist" | "calendar"> = {
    review_matches: "matching", send_selection: "shortlist", schedule_liked: "calendar", schedule_visit_requested: "calendar",
  };
  const na = overview?.nextAction ?? null;
  const doAction = () => {
    if (!na) return;
    if (na.key === "review_matches") {
      start(async () => { await markBuyerMatchesReviewedAction(buyerId); router.refresh(); onNavigate("matching"); });
    } else {
      onNavigate(actionTarget[na.key] ?? "matching");
    }
  };

  const chip = (n: number, label: string, tone: "brand" | "success" | "neutral" | "warning", to: "matching" | "shortlist") => (
    <button type="button" onClick={() => onNavigate(to)} className="bg-card border-line hover:border-brand/40 flex flex-1 flex-col items-center rounded-2xl border p-3 text-center transition">
      <span className="text-ink text-2xl font-black">{n}</span>
      <Badge tone={tone} size="sm">{label}</Badge>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── ZONO next best action ─────────────────────────────────────────── */}
      {na ? (
        <div className="bg-ink text-card flex flex-col gap-3 rounded-[20px] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="bg-card/15 grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Sparkles" size={17} /></span>
            <div>
              <p className="text-card/70 text-[11px] font-bold">הפעולה הבאה של ZONO</p>
              <p className="text-card text-[15px] font-extrabold leading-snug">{na.message}</p>
            </div>
          </div>
          <button type="button" onClick={doAction} disabled={pending}
            className="bg-card text-ink shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-black transition hover:opacity-90 disabled:opacity-60">
            {na.cta}
          </button>
        </div>
      ) : (
        <div className="bg-card border-line text-muted rounded-[20px] border p-5 text-sm">אין פעולה דחופה כרגע — הכול מעודכן. אפשר לבדוק נכסים מתאימים או לשלוח בחירה.</div>
      )}

      {/* ── New matches + shortlist state (real counts) ───────────────────── */}
      <div className="flex gap-2.5">
        {chip(c?.newCount ?? 0, "חדשות", "brand", "matching")}
        {chip(c?.shortlisted ?? 0, "בבחירה", "neutral", "shortlist")}
        {chip(c?.liked ?? 0, "אהב", "success", "shortlist")}
        {chip(c?.visitRequested ?? 0, "ביקש ביקור", "success", "shortlist")}
      </div>
      {overview?.newSinceLabel && (
        <button type="button" onClick={() => onNavigate("matching")} className="text-brand-strong inline-flex items-center gap-1 self-start text-[13px] font-bold">
          <Icon name="Sparkles" size={13} />{overview.newSinceLabel} · בדוק התאמות
        </button>
      )}

      {/* ── Next appointment + last communication ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-card border-line rounded-[20px] border p-4">
          <div className="mb-2 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Calendar" size={14} /></span><h3 className="text-ink text-[13px] font-black">הפגישה הבאה</h3></div>
          {nextMeeting ? (
            <button type="button" onClick={() => onNavigate("calendar")} className="w-full text-right">
              <p className="text-ink text-sm font-bold">{nextMeeting.title}</p>
              <p className="text-brand-strong text-xs font-bold">{fmtDateTime(nextMeeting.start_at)}</p>
            </button>
          ) : <p className="text-muted text-[12.5px]">אין פגישה מתוזמנת. {overview?.counts.liked ? "כדאי לקבוע ביקור." : ""}</p>}
        </div>
        <div className="bg-card border-line rounded-[20px] border p-4">
          <div className="mb-2 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="MessageCircle" size={14} /></span><h3 className="text-ink text-[13px] font-black">תקשורת אחרונה</h3></div>
          {lastComm ? (
            <button type="button" onClick={() => onNavigate("communication")} className="w-full text-right">
              <p className="text-ink text-sm font-semibold">{lastComm.subject ?? lastComm.type}</p>
              <p className="text-muted text-[11px]">{fmtDate(lastComm.occurred_at)}</p>
            </button>
          ) : <p className="text-muted text-[12.5px]">אין תקשורת מתועדת עדיין.</p>}
          <div className="mt-3 flex gap-2">
            {waHref && <a href={waHref} target="_blank" rel="noopener" className="bg-success-soft text-success inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"><Icon name="MessageCircle" size={12} />WhatsApp</a>}
            {phone && <a href={`tel:${phone}`} className="bg-surface text-ink inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"><Icon name="Phone" size={12} />טלפון</a>}
          </div>
        </div>
      </div>

      {/* ── Recent buyer activity ─────────────────────────────────────────── */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="mb-2 flex items-center gap-2"><span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Activity" size={14} /></span><h3 className="text-ink text-[13px] font-black">פעילות אחרונה</h3></div>
        {activities.length === 0 ? (
          <p className="text-muted text-[12.5px]">אין פעילות מתועדת עדיין.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {activities.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <span className="bg-surface text-muted mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg"><Icon name="Dot" size={14} /></span>
                <div><p className="text-ink text-[13px] font-semibold">{a.subject ?? a.type}</p><p className="text-muted text-[11px]">{fmtDate(a.occurred_at)}</p></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
