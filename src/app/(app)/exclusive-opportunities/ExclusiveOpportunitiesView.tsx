"use client";
// ============================================================================
// ZONO — Seller Intelligence™ Exclusive Opportunity command center (Phase 14).
// Executive widgets (top opportunities, probability distribution, today's
// priorities, seller funnel, totals) + per-seller actions (touchpoint/outcome).
// Deterministic data from the engine — no AI. Premium RTL, purple accents.
// ============================================================================
import { useState } from "react";
import { Handshake, Phone, MessageCircle, CalendarClock, RotateCcw, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import {
  recomputeExclusiveAcquisitionAction, recordSellerOutcomeAction, recordSellerTouchpointAction,
} from "@/lib/exclusive-acquisition/actions";
import { LIFECYCLE_LABEL } from "@/lib/exclusive-acquisition/lifecycle";
import type {
  ContactPriorityItem, ExclusiveBand, ExclusiveDashboard, SellerProfile,
} from "@/lib/exclusive-acquisition/types";

const BAND_LABEL: Record<ExclusiveBand, string> = { very_high: "גבוהה מאוד", high: "גבוהה", medium: "בינונית", low: "נמוכה" };
const BAND_TONE: Record<ExclusiveBand, string> = {
  very_high: "bg-emerald-500 text-white", high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700", low: "bg-black/5 text-ink/55",
};
const ACTION_LABEL: Record<string, string> = {
  call_today: "להתקשר היום", send_whatsapp: "וואטסאפ", schedule_meeting: "לקבוע פגישה", follow_up_tomorrow: "מעקב מחר", wait: "להמתין",
};
const fmt = (n: number) => n.toLocaleString("he-IL");

export function ExclusiveOpportunitiesView({ initial }: { initial: ExclusiveDashboard }) {
  const [data, setData] = useState<ExclusiveDashboard>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function recompute() {
    setBusy(true); setNote(null);
    const res = await recomputeExclusiveAcquisitionAction();
    if (res.ok) {
      setNote(`חושבו ${res.data.evaluated} הזדמנויות · ${res.data.created} חדשות · ${res.data.followupsCreated} מעקבים נוצרו`);
      const d = await getRefreshed();
      if (d) setData(d);
    } else setNote(res.error);
    setBusy(false);
  }
  async function getRefreshed(): Promise<ExclusiveDashboard | null> {
    const { getExclusiveDashboardAction } = await import("@/lib/exclusive-acquisition/actions");
    const r = await getExclusiveDashboardAction();
    return r.ok ? r.data : null;
  }

  const maxBand = Math.max(1, ...data.probabilityDistribution.map((b) => b.count));
  const maxStage = Math.max(1, ...data.funnel.map((s) => s.count));

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30"><Handshake size={20} /></span>
        <div>
          <h1 className="text-xl font-black text-ink">הזדמנויות בלעדיות — Seller Intelligence™</h1>
          <p className="text-xs font-bold text-ink/55">מי הכי קרוב לחתום בלעדיות, את מי לפנות קודם — ולמה. מנוע דטרמיניסטי, ללא AI.</p>
        </div>
        <button onClick={recompute} disabled={busy} className="ms-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-black text-white disabled:opacity-60">
          <RotateCcw size={15} className={busy ? "animate-spin" : ""} /> חשב מחדש
        </button>
      </header>
      {note && <p className="rounded-xl bg-brand-soft/50 px-3 py-2 text-sm font-bold text-brand-strong">{note}</p>}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="סה״כ הזדמנויות" value={data.totals.profiles} />
        <Kpi label="סבירות גבוהה מאוד" value={data.totals.veryHigh} hot />
        <Kpi label="סבירות גבוהה" value={data.totals.high} />
        <Kpi label="נוצר קשר היום" value={data.totals.contactedToday} />
        <Kpi label="בלעדיות נחתמו" value={data.totals.signed} good />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top opportunities */}
        <section className="lg:col-span-2 rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black text-ink"><TrendingUp size={15} className="text-brand-strong" /> הזדמנויות בלעדיות מובילות</h2>
          {data.topOpportunities.length === 0 ? (
            <Empty>אין עדיין הזדמנויות. הריצו חישוב מחדש לאחר סריקת שוק.</Empty>
          ) : (
            <div className="flex flex-col gap-2">{data.topOpportunities.map((p) => <OpportunityRow key={p.id} p={p} onChanged={async () => { const d = await getRefreshed(); if (d) setData(d); }} />)}</div>
          )}
        </section>

        {/* Distribution + funnel */}
        <div className="flex flex-col gap-4">
          <section className="rounded-[20px] border border-black/5 bg-white p-4">
            <h2 className="mb-3 text-sm font-black text-ink">פילוח סבירות בלעדיות</h2>
            <div className="flex flex-col gap-2">
              {data.probabilityDistribution.map((b) => (
                <div key={b.band} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12px] font-bold text-ink/70">{BAND_LABEL[b.band]}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/5"><div className={`h-full rounded-full ${BAND_TONE[b.band]}`} style={{ width: `${(b.count / maxBand) * 100}%` }} /></div>
                  <span className="w-6 text-left text-[12px] font-black text-ink">{b.count}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-[20px] border border-black/5 bg-white p-4">
            <h2 className="mb-3 text-sm font-black text-ink">משפך מוכרים</h2>
            <div className="flex flex-col gap-1.5">
              {data.funnel.filter((s) => s.count > 0).map((s) => (
                <div key={s.stage} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[12px] font-bold text-ink/70">{LIFECYCLE_LABEL[s.stage]}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-brand" style={{ width: `${(s.count / maxStage) * 100}%` }} /></div>
                  <span className="w-6 text-left text-[12px] font-black text-ink">{s.count}</span>
                </div>
              ))}
              {data.funnel.every((s) => s.count === 0) && <Empty>אין נתונים עדיין.</Empty>}
            </div>
          </section>
        </div>
      </div>

      {/* Today's priorities */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black text-ink"><CalendarClock size={15} className="text-brand-strong" /> מוכרים לפנייה היום</h2>
        {data.todaysPriorities.length === 0 ? (
          <Empty>אין מוכרים בעדיפות לפנייה כרגע.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">{data.todaysPriorities.map((t, i) => <PriorityRow key={t.profileId} t={t} rank={i + 1} />)}</div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hot, good }: { label: string; value: number; hot?: boolean; good?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${hot ? "border-emerald-200 bg-emerald-50/60" : "border-black/5 bg-white"}`}>
      <p className="text-[11px] font-bold text-ink/55">{label}</p>
      <p className={`text-2xl font-black ${good ? "text-emerald-600" : hot ? "text-emerald-700" : "text-brand-strong"}`}>{fmt(value)}</p>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">{children}</p>;
}

function OpportunityRow({ p, onChanged }: { p: SellerProfile; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function touch(channel: "call" | "whatsapp") { setBusy(true); await recordSellerTouchpointAction(p.id, channel, null, null); await onChanged(); setBusy(false); }
  async function outcome(o: "exclusive_signed" | "declined") { setBusy(true); await recordSellerOutcomeAction(p.id, o, null); await onChanged(); setBusy(false); }
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center">
          <span className="rounded-xl bg-brand px-2.5 py-1 text-sm font-black text-white">{p.exclusiveProbability}%</span>
          <span className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${BAND_TONE[p.exclusiveBand]}`}>{BAND_LABEL[p.exclusiveBand]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-black text-ink">{p.addressText ?? p.city ?? "נכס"}</p>
          <p className="text-[12px] font-semibold text-ink/55">
            {[p.neighborhood, p.city].filter(Boolean).join(", ")} · ציון מוכר {p.sellerScore}
            {p.buyerMatchCount > 0 ? ` · ${p.buyerMatchCount} קונים` : ""} · {LIFECYCLE_LABEL[p.lifecycleStage]}
          </p>
          {p.scoreReasons.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">{p.scoreReasons.slice(0, 4).map((r, i) => <span key={i} className="rounded-md bg-brand-soft/40 px-1.5 py-0.5 text-[10px] font-semibold text-brand-strong">{r.label}</span>)}</div>
          )}
          <p className="mt-1 text-[12px] font-bold text-brand-strong">המלצה: {ACTION_LABEL[p.recommendedAction] ?? p.recommendedAction} — {p.recommendedActionReason}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button disabled={busy} onClick={() => touch("call")} className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold text-ink/80 disabled:opacity-50"><Phone size={12} /> תיעוד שיחה</button>
        <button disabled={busy} onClick={() => touch("whatsapp")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 disabled:opacity-50"><MessageCircle size={12} /> וואטסאפ</button>
        <button disabled={busy} onClick={() => outcome("exclusive_signed")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"><CheckCircle2 size={12} /> נחתמה בלעדיות</button>
        <button disabled={busy} onClick={() => outcome("declined")} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 disabled:opacity-50"><XCircle size={12} /> סירב</button>
      </div>
    </div>
  );
}

function PriorityRow({ t, rank }: { t: ContactPriorityItem; rank: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white p-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-[12px] font-black text-brand-strong">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-ink">{t.addressText ?? t.city ?? "נכס"}</p>
        <p className="text-[11px] font-semibold text-ink/55">{ACTION_LABEL[t.recommendedAction] ?? t.recommendedAction}{t.buyerMatchCount > 0 ? ` · ${t.buyerMatchCount} קונים` : ""}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${BAND_TONE[t.exclusiveBand]}`}>{t.exclusiveProbability}%</span>
    </div>
  );
}
