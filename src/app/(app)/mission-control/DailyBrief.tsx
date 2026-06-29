"use client";
// ============================================================================
// ☀️ AI Daily Briefing & Mission Engine™ — the first screen of Mission Control.
// Phase 27.6. Proactive, presentation-only: every morning ZONO surfaces what
// changed, what needs attention, what's waiting — from EXISTING intelligence
// only. No AI calls, no new calculations (plain counts/filters over already-
// fetched arrays), no execution. Per-card dismiss/pin/reviewed is local-only.
// ============================================================================
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Pill, TerminalEmpty } from "@/components/intelligence/terminal";
import { bucketRecommendations } from "@/lib/intelligence-explorer/action-center-shared";
import { listMissionDraftsAction } from "@/lib/ai-mission-planner/service";
import type { MissionControlDTO } from "@/lib/mission-control/types";
import type { MissionDraft } from "@/lib/ai-mission-planner/types";

const QUICK_QUESTIONS = ["מה השתנה מאז אתמול?", "איזה משרד מוביל בשכונה?", "הצג הזדמנויות חזקות", "מי המתחרה הקרוב?"];

// ── Local-only briefing state (dismiss is per-day; pin/reviewed persist) ─────
const KEY = "zono_daily_brief_state";
interface BriefState { date: string; dismissed: string[]; pinned: string[]; reviewed: string[] }
const todayKey = () => new Date().toISOString().slice(0, 10);

function useBriefState() {
  const [s, setS] = useState<BriefState>({ date: todayKey(), dismissed: [], pinned: [], reviewed: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: BriefState | null = raw ? JSON.parse(raw) : null;
      const next: BriefState = parsed && parsed.date === todayKey()
        ? parsed
        : { date: todayKey(), dismissed: [], pinned: parsed?.pinned ?? [], reviewed: parsed?.reviewed ?? [] };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate from localStorage
      setS(next);
    } catch { /* storage optional */ }
  }, []);
  const persist = (next: BriefState) => { setS(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const toggle = (k: "dismissed" | "pinned" | "reviewed", id: string) => {
    const has = s[k].includes(id);
    persist({ ...s, date: todayKey(), [k]: has ? s[k].filter((x) => x !== id) : [...s[k], id] });
  };
  return { s, toggle };
}

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

function Card({ id, title, count, children, state, toggle }: {
  id: string; title: string; count?: number; children: ReactNode;
  state: BriefState; toggle: (k: "dismissed" | "pinned" | "reviewed", id: string) => void;
}) {
  const dismissed = state.dismissed.includes(id);
  const reviewed = state.reviewed.includes(id);
  if (dismissed) {
    return (
      <div className="border-line bg-surface text-muted flex items-center justify-between rounded-xl border border-dashed px-3 py-2 text-xs">
        <span>{title} — נדחה להיום</span>
        <button type="button" onClick={() => toggle("dismissed", id)} className="text-brand-strong font-bold">החזר</button>
      </div>
    );
  }
  return (
    <section className={`border-line bg-card rounded-2xl border p-4 ${reviewed ? "opacity-70" : ""}`}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-ink flex items-center gap-2 text-sm font-black">
          {state.pinned.includes(id) && <span title="מוצמד">📌</span>}{title}
          {typeof count === "number" && <Pill tone={count > 0 ? "rising" : "neutral"}>{count}</Pill>}
          {reviewed && <span className="text-emerald-600">✓</span>}
        </h3>
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={() => toggle("pinned", id)} className="text-muted hover:text-ink font-bold">{state.pinned.includes(id) ? "בטל הצמדה" : "הצמד"}</button>
          <button type="button" onClick={() => toggle("reviewed", id)} className="text-muted hover:text-ink font-bold">{reviewed ? "בטל סימון" : "סמן כנבדק"}</button>
          <button type="button" onClick={() => toggle("dismissed", id)} className="text-muted hover:text-ink font-bold">הסתר היום</button>
        </div>
      </header>
      {children}
    </section>
  );
}

export function DailyBrief({ data }: { data: MissionControlDTO }) {
  const { s, toggle } = useBriefState();
  const [drafts, setDrafts] = useState<MissionDraft[]>([]);
  useEffect(() => { (async () => { try { setDrafts(await listMissionDraftsAction()); } catch { /* table may be absent */ } })(); }, []);

  const ex = data.actionCenter.dashboard.explorer;
  const today = bucketRecommendations(data.actionCenter.recommendations).today;
  const opportunities = ex.opportunitySignals;
  const newListings = [...ex.listings].filter((l) => l.firstSeenAt).sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime());
  const priceDrops = data.actionCenter.dashboard.marketStats.priceDrops;
  const pendingReview = drafts.filter((d) => d.status === "ready_for_review" || d.status === "draft");
  const approvedAwaiting = drafts.filter((d) => d.status === "approved");

  // Morning summary — plain counts over existing data.
  const summary: string[] = [];
  if (opportunities.length) summary.push(`היום זוהו ${opportunities.length} הזדמנויות.`);
  if (pendingReview.length) summary.push(`${pendingReview.length} טיוטות משימה ממתינות לבדיקה.`);
  if (approvedAwaiting.length) summary.push(`${approvedAwaiting.length} משימות מאושרות ממתינות להמרה.`);
  if (priceDrops) summary.push(`${priceDrops} ירידות מחיר באזורך.`);
  if (today.length) summary.push(`${today.length} פעולות בעדיפות גבוהה להיום.`);

  // Card order: pinned first (stable), then the rest.
  const cardIds = ["priorities", "newIntel", "opportunities", "approvals", "schedule", "quick"];
  const ordered = [...cardIds].sort((a, b) => Number(s.pinned.includes(b)) - Number(s.pinned.includes(a)));

  const render = (id: string): ReactNode => {
    if (id === "priorities") return (
      <Card key={id} id={id} title="העדיפויות של היום" count={today.length} state={s} toggle={toggle}>
        {today.length ? (
          <div className="flex flex-col">
            {today.slice(0, 6).map((r) => (
              <div key={r.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span className="text-ink min-w-0 truncate font-bold">{r.title_hebrew}</span>
                <Pill tone={r.urgency_score >= 70 ? "rising" : "contender"}>{Math.round(r.urgency_score)}</Pill>
              </div>
            ))}
            <Link href="/action-center" className="text-brand mt-2 text-xs font-bold">פתח מרכז פעולות ←</Link>
          </div>
        ) : <TerminalEmpty text="אין פעולות בעדיפות גבוהה להיום." />}
      </Card>
    );
    if (id === "newIntel") return (
      <Card key={id} id={id} title="מודיעין חדש" count={opportunities.length + (priceDrops ? 1 : 0)} state={s} toggle={toggle}>
        <ul className="flex flex-col gap-1 text-xs">
          <li className="text-muted">ירידות מחיר: <span className="text-ink font-bold">{priceDrops}</span></li>
          <li className="text-muted">מודעות אחרונות: <span className="text-ink font-bold">{newListings.length}</span></li>
          <li className="text-muted">אותות שוק/הזדמנויות: <span className="text-ink font-bold">{opportunities.length}</span></li>
        </ul>
        {opportunities.slice(0, 4).map((o, i) => (
          <p key={i} className="text-muted mt-1 truncate text-[11px]"><span className="text-ink font-bold">{o.label}</span> · {[o.neighborhood, o.city].filter(Boolean).join(", ") || "—"} · {o.reason}</p>
        ))}
      </Card>
    );
    if (id === "opportunities") return (
      <Card key={id} id={id} title="הזדמנויות היום" count={opportunities.length} state={s} toggle={toggle}>
        {newListings.filter((l) => l.opportunityScore >= 70).length ? (
          <div className="flex flex-col">
            {newListings.filter((l) => l.opportunityScore >= 70).slice(0, 5).map((l) => (
              <Link key={l.id} href={`/external-listings/${encodeURIComponent(l.id)}`} prefetch={false} className="border-line/60 hover:bg-surface flex items-center justify-between gap-2 border-b py-1.5 text-xs transition last:border-0">
                <span className="text-ink min-w-0 truncate font-bold">{l.title ?? "מודעה"}<span className="text-muted font-normal"> · {ils(l.price)}</span></span>
                <Pill tone="rising">{Math.round(l.opportunityScore)}</Pill>
              </Link>
            ))}
          </div>
        ) : <TerminalEmpty text="אין הזדמנויות בעלות פוטנציאל גבוה היום." />}
      </Card>
    );
    if (id === "approvals") return (
      <Card key={id} id={id} title="ממתין לאישור" count={pendingReview.length + approvedAwaiting.length} state={s} toggle={toggle}>
        <ul className="flex flex-col gap-1 text-xs">
          <li className="text-muted">טיוטות לבדיקה: <span className="text-ink font-bold">{pendingReview.length}</span></li>
          <li className="text-muted">מאושרות להמרה למשימה: <span className="text-ink font-bold">{approvedAwaiting.length}</span></li>
        </ul>
        {(pendingReview.length + approvedAwaiting.length) === 0 && <TerminalEmpty text="אין פריטים הממתינים לאישור." />}
        <p className="text-muted mt-2 text-[11px]">אישור/המרה מתבצעים במתכנן המשימות למטה.</p>
      </Card>
    );
    if (id === "schedule") return (
      <Card key={id} id={id} title="היומן של היום" state={s} toggle={toggle}>
        <TerminalEmpty text="אין יומן מחובר. כשתחבר יומן, אירועי היום יופיעו כאן." />
      </Card>
    );
    if (id === "quick") return (
      <Card key={id} id={id} title="שאלות מהירות" state={s} toggle={toggle}>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <a key={q} href="#ai-workspace" className="border-line bg-surface text-ink hover:border-brand-light rounded-full border px-2.5 py-1 text-[11px] font-bold transition">{q}</a>
          ))}
        </div>
        <p className="text-muted mt-2 text-[11px]">הקלד שאלה בסביבת עבודת ה-AI למטה (תשובה מבוססת הקשר בלבד).</p>
      </Card>
    );
    return null;
  };

  return (
    <section dir="rtl" className="border-brand-light/40 from-brand-soft/40 flex flex-col gap-4 rounded-3xl border bg-gradient-to-bl to-transparent p-5 sm:p-6">
      <div>
        <p className="text-brand text-[11px] font-black tracking-wide">AI DAILY BRIEFING™</p>
        <h2 className="text-ink text-xl font-black sm:text-2xl">בוקר טוב{data.session.agentName ? `, ${data.session.agentName}` : ""} — המשימה של היום</h2>
        {summary.length ? (
          <ul className="mt-2 flex flex-col gap-0.5">
            {summary.map((line, i) => <li key={i} className="text-ink text-sm">• {line}</li>)}
          </ul>
        ) : <p className="text-muted mt-2 text-sm">אין שינויים חדשים לדווח עליהם הבוקר. הכול תחת שליטה.</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ordered.map(render)}
      </div>
    </section>
  );
}
