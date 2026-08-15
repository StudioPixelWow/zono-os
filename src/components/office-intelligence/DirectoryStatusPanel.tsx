"use client";
// ============================================================================
// 🛰️ Directory Status Panel — live, real-progress processing state for the city
// office directory. Reads PERSISTED pipeline state (background-safe: navigating
// away / refreshing never restarts a job). Shows the five real stages, honest
// counts, partial results early, a delayed state, an honest provider-blocked
// state, and a completion collapse. NO fake timers/ETA/percentages.
// ============================================================================
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getCityDirectoryStatusAction, refreshCityDirectoryAction } from "@/lib/brokerage-data/city-directory/actions";
import type { CityDirectoryStatus } from "@/lib/brokerage-data/city-directory/types";

type StageState = "pending" | "running" | "completed" | "partial" | "failed" | "blocked";
const fmt = (n: number) => n.toLocaleString("he-IL");

const STAGE_LABELS = [
  "מאתרים את משרדי התיווך בעיר",
  "מאתרים את המתווכים",
  "מחברים מתווכים למשרדים לפי מקורות ציבוריים",
  "מצליבים מול המודעות ש-ZONO סרקה",
  "מחשבים פעילות ותחרות",
];

const DOT: Record<StageState, string> = {
  completed: "bg-emerald-500", partial: "bg-amber-500", running: "bg-brand-strong animate-pulse",
  failed: "bg-rose-500", blocked: "bg-slate-400", pending: "bg-slate-300",
};

function deriveStages(st: CityDirectoryStatus | null): StageState[] {
  const run = st?.run;
  const a = st?.activity;
  const provider = run?.providerStatus ?? null;
  const blocked = provider === "provider_not_configured" || provider === "provider_blocked" || run?.status === "blocked";
  if (blocked) return STAGE_LABELS.map(() => "blocked");
  const running = run?.status === "running" && !run?.isStale;
  const terminal = run?.status === "success" || run?.status === "partial";
  const failed = run?.status === "failed" || run?.status === "timed_out";
  const offices = run?.officesDiscovered ?? a?.directoryOffices ?? 0;
  const agents = run?.agentsDiscovered ?? a?.directoryAgents ?? 0;
  const rels = run?.relationshipsDiscovered ?? a?.directoryRelationships ?? 0;
  const crossed = (a?.observedListings ?? 0) > 0 || (a?.observedActiveAgents ?? 0) > 0;

  const stage = (has: boolean): StageState =>
    failed ? "failed" : terminal ? (has ? "completed" : "partial") : running ? "running" : "pending";

  return [
    stage(offices > 0),
    stage(agents > 0),
    stage(rels > 0),
    failed ? "failed" : terminal ? (crossed ? "completed" : "partial") : running ? "running" : "pending",
    failed ? "failed" : terminal ? "completed" : running ? "running" : "pending",
  ];
}

export function DirectoryStatusPanel({ city }: { city: string }) {
  const [status, setStatus] = useState<CityDirectoryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, start] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!city) return;
    setLoading(true);
    const res = await getCityDirectoryStatusAction(city);
    if (res.ok && res.data) setStatus(res.data);
    setLoading(false);
  }, [city]);

  // Load on mount / city change. Poll ONLY while a run is active (reads only).
  // Deferred (not synchronous in the effect body) to avoid cascading renders.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(t); if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  useEffect(() => {
    if (status?.run?.status === "running" && !status.run.isStale) {
      timer.current = setTimeout(() => { void load(); }, 15_000);
      return () => { if (timer.current) clearTimeout(timer.current); };
    }
  }, [status, load]);

  if (!city) return null;

  const run = status?.run ?? null;
  const activity = status?.activity ?? null;
  const provider = run?.providerStatus ?? null;
  const blocked = provider === "provider_not_configured" || provider === "provider_blocked" || run?.status === "blocked";
  const running = run?.status === "running" && !run?.isStale;
  const delayed = !!run?.isStale;
  const terminal = run?.status === "success" || run?.status === "partial";
  const stages = deriveStages(status);

  const doRefresh = () => start(async () => { const res = await refreshCityDirectoryAction(city); if (res.ok && res.status) setStatus(res.status); });

  // ── Completion collapse ────────────────────────────────────────────────────
  if (terminal && collapsed) {
    return (
      <div dir="rtl" className="border-line bg-card flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-[12px]">
        <span className="font-black text-emerald-700">✓ מודיעין המשרדים עודכן</span>
        <span className="text-muted">
          {fmt(activity?.directoryOffices ?? 0)} משרדים · {fmt(activity?.directoryAgents ?? 0)} מתווכים · {fmt(activity?.directoryRelationships ?? 0)} קשרים · {fmt(activity?.agentsUnresolved ?? 0)} ללא שיוך מאומת
        </span>
        <button onClick={() => setCollapsed(false)} className="text-brand-strong font-bold">הצג פירוט</button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="border-brand/30 bg-brand-soft/30 flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-brand-strong text-lg font-black">מודיעין המשרדים ב{city}</h2>
          <p className="text-muted text-[12px]">
            {blocked ? "ממתין למקור מדריך מאומת" : running ? "ZONO מנתחת עכשיו את מפת המשרדים והמתווכים בעיר." : delayed ? "העדכון מתעכב" : terminal ? "המידע שאומת נשמר." : "טרם הורץ מדריך משרדים לעיר זו."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {terminal && <button onClick={() => setCollapsed(true)} className="text-muted hover:text-ink text-[12px] font-bold">כווץ</button>}
          <button onClick={doRefresh} disabled={refreshing || running} className="bg-brand-strong rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
            {refreshing ? "מרענן…" : running ? "רץ…" : "רענן מדריך"}
          </button>
        </div>
      </div>

      {/* Honest provider-blocked banner */}
      {blocked && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-[12px] text-slate-700">
          <p className="font-bold">מקור המדריך אינו מחובר עדיין</p>
          <p className="mt-1 leading-relaxed">{run?.error ?? "actor המדריך המאומת של מדלן טרם הוגדר. המערכת לא ממציאה נתונים — היא ממתינה למקור מאומת. אינטליגנציית המודעות (Property Radar) ממשיכה לפעול כרגיל."}</p>
        </div>
      )}

      {/* Delayed banner */}
      {delayed && !blocked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-800">
          <p className="font-bold">העדכון מתעכב</p>
          <p className="mt-1">המידע שכבר אומת נשמר. ZONO ממשיכה לנסות ברקע.</p>
        </div>
      )}

      {/* Real stages */}
      <ol className="flex flex-col gap-1.5">
        {STAGE_LABELS.map((label, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[stages[i]]}`} />
            <span className={stages[i] === "pending" || stages[i] === "blocked" ? "text-muted" : "text-ink font-medium"}>
              שלב {i + 1}: {label}
            </span>
            {stages[i] === "running" && <span className="text-brand-strong text-[11px] font-bold">רץ עכשיו</span>}
            {stages[i] === "partial" && <span className="text-[11px] font-bold text-amber-600">חלקי</span>}
          </li>
        ))}
      </ol>

      {/* Real, measurable counts (partial results shown as soon as available) */}
      {!blocked && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="משרדים במאגר" value={activity?.directoryOffices ?? run?.officesDiscovered ?? 0} />
          <Metric label="מתווכים במאגר" value={activity?.directoryAgents ?? run?.agentsDiscovered ?? 0} />
          <Metric label="קשרי מתווך–משרד" value={activity?.directoryRelationships ?? run?.relationshipsDiscovered ?? 0} />
          <Metric label="מתווכים ללא שיוך מאומת" value={activity?.agentsUnresolved ?? run?.agentsWithoutOffice ?? 0} />
          <Metric label="משרדים עם פעילות שנצפתה" value={activity?.observedActiveOffices ?? 0} />
          <Metric label="מתווכים שנצפו פעילים" value={activity?.observedActiveAgents ?? 0} />
          <Metric label="מודעות פעילות שנצפו" value={activity?.observedListings ?? 0} />
          <Metric label="עודכן" value={null} text={run?.finishedAt ? new Date(run.finishedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"} />
        </div>
      )}

      <p className="text-muted text-[11px]">אפשר להמשיך לעבוד ב-ZONO — התהליך ממשיך ברקע.{loading ? " טוען…" : ""}</p>
    </div>
  );
}

function Metric({ label, value, text }: { label: string; value: number | null; text?: string }) {
  return (
    <div className="border-line bg-card rounded-xl border p-2.5">
      <p className="text-ink text-lg font-black tabular-nums">{text ?? (value ?? 0).toLocaleString("he-IL")}</p>
      <p className="text-muted text-[11px]">{label}</p>
    </div>
  );
}
