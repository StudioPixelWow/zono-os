"use client";
// ============================================================================
// ZONO — My Office vs Market view. Premium, RTL, mobile-first. Three states:
// resolved (share of observed inventory + competitors + insights), needs-
// confirmation (claim: confirm / reject candidates), and unresolved (honest
// empty state). Share is ALWAYS framed as "נתח מתוך המלאי שנצפה על ידי ZONO".
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { MyOfficeReport } from "@/lib/office-intel/my-office";
import type { SelfOfficeCandidate } from "@/lib/office-intel/self-office";
import { confirmMyOfficeAction, rejectMyOfficeAction } from "./actions";

export function MyOfficeView({ report }: { report: MyOfficeReport }) {
  const { resolution, share, competitors } = report;

  if (resolution.status === "resolved" && resolution.officeId) {
    const rivals = competitors?.competitors ?? [];
    const insights = competitors?.insights ?? [];
    const momentum = competitors?.target.momentum;
    return (
      <div dir="rtl" className="flex flex-col gap-5 pb-10">
        <Header title="המשרד שלי מול השוק" subtitle={resolution.officeName ?? "המשרד שלי"} confirmed />

        {share && (
          <section className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center gap-6">
              <ShareDial pct={share.sharePct} />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-lg font-black">נתח מתוך המלאי שנצפה על ידי ZONO{share.cityLabel ? ` ב${share.cityLabel}` : ""}</p>
                <p className="text-muted mt-1 text-[13px]">
                  {share.officeObserved.toLocaleString("he-IL")} מתוך {share.cityObserved.toLocaleString("he-IL")} מודעות שנצפו
                  {share.cityRank ? ` · מדורג #${share.cityRank} מתוך ${share.cityOfficeCount} משרדים נצפים` : ""}
                </p>
                <p className="text-muted/80 mt-2 text-[11px]">זהו נתח מהמלאי שנצפה בפועל על ידי ZONO — לא נתח שוק מוחלט.</p>
              </div>
              {momentum && (
                <div className="text-center">
                  <div className="text-brand-strong text-2xl font-black tabular-nums">{momentum.score}</div>
                  <div className="text-muted text-[10px] font-bold">מומנטום</div>
                </div>
              )}
            </div>
          </section>
        )}

        {insights.length > 0 && (
          <Panel title="מודיעין הזדמנויות">
            <ul className="flex flex-col gap-2">
              {insights.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-[13.5px]"><span className="text-brand-strong mt-0.5 shrink-0"><Icon name="Sparkles" size={14} /></span><span className="text-ink">{t}</span></li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title={`חמשת המתחרים הישירים המובילים${rivals.length ? ` (${rivals.length})` : ""}`}>
          {rivals.length ? (
            <div className="flex flex-col gap-2.5">
              {rivals.map((r) => (
                <Link key={r.officeId} href={`/brokerage-data/offices/${r.officeId}`} prefetch={false}
                  className="border-line hover:bg-surface/60 flex items-center justify-between gap-3 rounded-2xl border p-3 transition">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="text-ink truncate font-black">{r.name}</span>{r.brand && <span className="text-brand-strong shrink-0 text-xs font-bold">· {r.brand}</span>}</div>
                    {r.sharedNeighborhoods.length > 0 && <p className="text-muted mt-0.5 truncate text-[11.5px]">שכונות משותפות: {r.sharedNeighborhoods.slice(0, 3).join(" · ")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-center"><div className="text-ink font-black tabular-nums">{r.score}</div><div className="text-muted text-[9px] font-bold">תחרות</div></div>
                    <div className="text-center"><div className="text-brand-strong font-black tabular-nums">{r.overlapPct}%</div><div className="text-muted text-[9px] font-bold">חפיפה</div></div>
                  </div>
                </Link>
              ))}
            </div>
          ) : <p className="text-muted text-sm">ZONO עדיין אוספת נתונים כדי לזהות מתחרים ישירים עבור המשרד שלך.</p>}
          <div className="mt-3">
            <Link href={`/brokerage-data/offices/${resolution.officeId}`} className="text-brand-strong text-[13px] font-bold">למודיעין המלא של המשרד שלי ←</Link>
          </div>
        </Panel>

        <RejectFooter officeId={resolution.officeId} label="זה לא המשרד שלי" />
      </div>
    );
  }

  if (resolution.status === "needs_confirmation" && resolution.candidates.length) {
    return (
      <div dir="rtl" className="flex flex-col gap-5 pb-10">
        <Header title="איזה משרד הוא שלך?" subtitle="אישור זהות המשרד" />
        <Panel title="מצאנו התאמות אפשריות">
          <p className="text-muted mb-3 text-[13px]">ZONO לעולם לא משייכת אותך למשרד לפי שם בלבד. אשר את המשרד שלך כדי לפתוח את ״המשרד שלי מול השוק״.</p>
          <div className="flex flex-col gap-2.5">
            {resolution.candidates.map((c) => <ClaimCandidate key={c.officeId} c={c} />)}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-10">
      <Header title="המשרד שלי מול השוק" subtitle="זיהוי המשרד שלי" />
      <Panel title="עדיין לא זיהינו את המשרד שלך">
        <p className="text-muted text-sm">ZONO עדיין אוספת ומצליבה נתונים כדי לזהות את המשרד שלך לפי טלפון/אימייל — לא לפי שם בלבד. ברגע שנזהה התאמה ודאית, ״המשרד שלי מול השוק״ ייפתח כאן אוטומטית.</p>
        <Link href="/brokerage-data/offices" className="text-brand-strong mt-3 inline-block text-[13px] font-bold">עיין במודיעין המשרדים ←</Link>
      </Panel>
    </div>
  );
}

function ClaimCandidate({ c }: { c: SelfOfficeCandidate }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<null | "confirmed" | "rejected">(null);
  if (done === "rejected") return null;
  return (
    <div className="border-line flex flex-col gap-2 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="text-ink truncate font-black">{c.name}</span>{c.brand && <span className="text-brand-strong shrink-0 text-xs font-bold">· {c.brand}</span>}{c.city && <span className="text-muted shrink-0 text-xs">· {c.city}</span>}</div>
        {c.reason && <p className="text-muted mt-0.5 text-[12px]">{c.reason}</p>}
        {done === "confirmed" && <p className="mt-1 text-[12px] font-bold text-emerald-600">אושר — רענן כדי לראות את המשרד שלי מול השוק.</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={pending || done === "confirmed"} onClick={() => start(async () => { await confirmMyOfficeAction(c.officeId); setDone("confirmed"); })}
          className="bg-brand-strong rounded-xl px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50">זה המשרד שלי</button>
        <button type="button" disabled={pending} onClick={() => start(async () => { await rejectMyOfficeAction(c.officeId); setDone("rejected"); })}
          className="border-line text-muted hover:text-ink rounded-xl border px-3.5 py-2 text-[13px] font-bold disabled:opacity-50">לא שלי</button>
      </div>
    </div>
  );
}

function RejectFooter({ officeId, label }: { officeId: string; label: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <p className="text-muted text-center text-[12px]">השיוך בוטל — רענן את העמוד.</p>;
  return (
    <div className="text-center">
      <button type="button" disabled={pending} onClick={() => start(async () => { await rejectMyOfficeAction(officeId); setDone(true); })}
        className="text-muted hover:text-ink text-[12px] font-semibold underline disabled:opacity-50">{label}</button>
    </div>
  );
}

function Header({ title, subtitle, confirmed }: { title: string; subtitle: string; confirmed?: boolean }) {
  return (
    <header className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Building2" size={24} /></span>
        <div>
          <p className="text-muted text-[11px] font-bold">{subtitle}{confirmed ? " · מאושר" : ""}</p>
          <h1 className="text-ink text-2xl font-black leading-tight">{title}</h1>
        </div>
      </div>
    </header>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-card border-line rounded-[18px] border p-5 shadow-[var(--shadow-card)]"><h2 className="text-ink mb-3 text-sm font-black">{title}</h2>{children}</div>;
}
function ShareDial({ pct }: { pct: number }) {
  const deg = Math.min(100, pct) * 3.6;
  return (
    <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: `conic-gradient(var(--brand-strong,#6d28d9) ${deg}deg, var(--line,#e5e7eb) 0deg)` }}>
      <div className="bg-card absolute inset-[9px] grid place-items-center rounded-full text-center">
        <div><div className="text-ink text-xl font-black tabular-nums leading-none">{pct}%</div><div className="text-muted mt-0.5 text-[9px] font-bold">נתח נצפה</div></div>
      </div>
    </div>
  );
}
