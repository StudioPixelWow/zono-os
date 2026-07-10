// ============================================================================
// 🗓️ ZONO — Broker Today Agenda (server component). Phase 2 of the Broker OS.
// Renders the chronological workday the scheduler built from the ONE shared
// priority queue — a real "do this, then this" day, not a dashboard or a flat
// task list. Each block carries its time, the action, WHY it matters, and its
// evidence confidence, so the broker never has to ask "what should I do now?".
// Honest empty state. Reuses the shared Icon + queue service — no new engine.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getBrokerTodayAgenda } from "@/lib/broker-intelligence/agenda-service";
import type { AgendaSlot } from "@/lib/broker-intelligence/agenda";

/** Icon + accent per action class — purely presentational. */
const KIND_META: Record<string, { icon: string; accent: string }> = {
  call: { icon: "Phone", accent: "text-rose-500 bg-rose-500/10" },
  send: { icon: "Send", accent: "text-brand bg-brand-soft" },
  price: { icon: "Tag", accent: "text-amber-600 bg-amber-500/10" },
  marketing: { icon: "Megaphone", accent: "text-fuchsia-600 bg-fuchsia-500/10" },
  mortgage: { icon: "Landmark", accent: "text-emerald-600 bg-emerald-500/10" },
  meeting: { icon: "Users", accent: "text-blue-600 bg-blue-500/10" },
  document: { icon: "FileText", accent: "text-slate-600 bg-slate-500/10" },
  wait: { icon: "Clock", accent: "text-slate-500 bg-slate-400/10" },
};
const DEFAULT_META = { icon: "ListChecks", accent: "text-brand bg-brand-soft" };

export async function BrokerTodayAgenda() {
  const agenda = await getBrokerTodayAgenda();

  if (agenda.slots.length === 0) {
    return (
      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <AgendaHeader firstActionTime={null} plannedMinutes={0} count={0} />
        <p className="text-muted bg-surface mt-3 rounded-xl px-3 py-6 text-center text-[13px]">
          אין עדיין מספיק ראיות כדי לבנות סדר יום — התור החכם יתמלא ככל שייכנסו נתונים אמיתיים.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <AgendaHeader firstActionTime={agenda.firstActionTime} plannedMinutes={agenda.plannedMinutes} count={agenda.slots.length} />
      <ol className="mt-4 flex flex-col">
        {agenda.slots.map((slot, i) => (
          <AgendaRow key={slot.rec.id} slot={slot} isLast={i === agenda.slots.length - 1} />
        ))}
      </ol>
      {agenda.overflow > 0 && (
        <p className="text-muted mt-3 text-center text-[11px]">
          ועוד {agenda.overflow} פעולות בתור — יופיעו מחר או כשיתפנה זמן ביום.
        </p>
      )}
    </div>
  );
}

function AgendaHeader({ firstActionTime, plannedMinutes, count }: { firstActionTime: string | null; plannedMinutes: number; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Calendar" size={18} /></span>
      <div className="flex-1">
        <h3 className="text-ink text-sm font-black">סדר היום שלך</h3>
        <p className="text-muted text-[11px]">
          {count > 0
            ? `${count} פעולות · מתחיל ב-${firstActionTime} · ${plannedMinutes} דק׳ מתוכננות`
            : "נבנה אוטומטית מהתור החכם — לפי השפעה עסקית"}
        </p>
      </div>
    </div>
  );
}

function AgendaRow({ slot, isLast }: { slot: AgendaSlot; isLast: boolean }) {
  const meta = KIND_META[slot.kind] ?? DEFAULT_META;
  return (
    <li className={`flex gap-3 ${slot.past ? "opacity-55" : ""}`}>
      {/* time rail */}
      <div className="flex w-14 shrink-0 flex-col items-end pt-0.5">
        <span className="text-ink text-[13px] font-black tabular-nums">{slot.startTime}</span>
        <span className="text-muted text-[10px] tabular-nums">{slot.endTime}</span>
      </div>
      {/* timeline spine */}
      <div className="flex flex-col items-center">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.accent}`}>
          <Icon name={meta.icon} size={15} />
        </span>
        {!isLast && <span className="bg-line my-1 w-px flex-1" />}
      </div>
      {/* block */}
      <div className={`mb-3 flex-1 rounded-2xl border px-3.5 py-3 ${slot.past ? "border-line bg-surface" : "border-line bg-surface/60"}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-ink text-[13px] font-black leading-snug">{slot.rec.title}</p>
          <span className="text-muted shrink-0 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-bold">ביטחון {slot.rec.confidence}%</span>
        </div>
        <p className="text-muted mt-1 text-[12px] leading-relaxed">{slot.rec.why}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {slot.rec.href ? (
            <a href={slot.rec.href} className="text-brand bg-brand-soft inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition hover:opacity-80">
              {slot.rec.suggestedAction} <Icon name="ChevronLeft" size={12} />
            </a>
          ) : (
            <span className="text-brand bg-brand-soft inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold">{slot.rec.suggestedAction}</span>
          )}
          {slot.rec.mergedCount > 1 && (
            <span className="text-muted rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-bold">{slot.rec.mergedCount} מנועים תואמים</span>
          )}
        </div>
      </div>
    </li>
  );
}
