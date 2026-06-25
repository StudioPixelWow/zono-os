"use client";
import { useState, useTransition } from "react";
import { Target, Plus, Trash2 } from "lucide-react";
import { upsertOfficeGoalAction, archiveOfficeGoalAction } from "@/lib/office-intelligence/actions";
import type { GoalProgress, GoalType } from "@/lib/office-intelligence/types";

const GOAL_LABELS: Record<GoalType, string> = {
  listings: "נכסים", exclusives: "בלעדיות", calls: "שיחות", meetings: "פגישות",
  buyer_matches: "התאמות קונים", revenue: "הכנסה", commission: "עמלות", tasks_completed: "משימות",
};
const PERIODS: { v: string; l: string }[] = [
  { v: "daily", l: "יומי" }, { v: "weekly", l: "שבועי" }, { v: "monthly", l: "חודשי" }, { v: "quarterly", l: "רבעוני" },
];
const STATUS: Record<string, { l: string; c: string }> = {
  ahead: { l: "מקדים", c: "text-emerald-600" }, on_track: { l: "במסלול", c: "text-sky-600" },
  behind: { l: "בפיגור", c: "text-red-600" }, no_target: { l: "ללא יעד", c: "text-ink/40" },
};

export function OfficeGoalsPanel({ goals, onChanged }: { goals: GoalProgress[]; onChanged?: () => void }) {
  const [adding, setAdding] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("exclusives");
  const [period, setPeriod] = useState("monthly");
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();

  const save = () => {
    const t = Number(target);
    if (!t || t <= 0) return;
    start(async () => {
      await upsertOfficeGoalAction({ goalType, period, target: t, startsAt: null, endsAt: null });
      setAdding(false); setTarget("");
      onChanged?.();
    });
  };
  const remove = (id: string) => start(async () => { await archiveOfficeGoalAction(id); onChanged?.(); });

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-black text-ink"><Target size={16} /> יעדי המשרד</h2>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-[12px] font-bold text-brand-strong hover:bg-brand-soft/70"><Plus size={13} /> יעד</button>
      </div>
      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-black/5 bg-black/[0.02] p-3">
          <label className="flex flex-col gap-0.5 text-[11px] font-bold text-ink/55">סוג
            <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)} className="rounded-lg border border-black/10 px-2 py-1 text-[12px] font-semibold text-ink">
              {Object.entries(GOAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-bold text-ink/55">תקופה
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1 text-[12px] font-semibold text-ink">
              {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-bold text-ink/55">יעד
            <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" min={1} className="w-24 rounded-lg border border-black/10 px-2 py-1 text-[12px] font-semibold text-ink" />
          </label>
          <button onClick={save} disabled={pending} className="rounded-lg bg-brand-strong px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">{pending ? "שומר…" : "שמור"}</button>
        </div>
      )}
      {goals.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">לא הוגדרו יעדים. הוסף יעד ראשון.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((g) => {
            const st = STATUS[g.status] ?? STATUS.no_target!;
            return (
              <li key={g.id} className="rounded-2xl border border-black/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black text-ink">{GOAL_LABELS[g.goalType]}<span className="ms-1 text-[11px] font-bold text-ink/40">({PERIODS.find((p) => p.v === g.period)?.l})</span></span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-bold ${st.c}`}>{st.l}</span>
                    <button onClick={() => remove(g.id)} disabled={pending} className="text-ink/30 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-brand-strong" style={{ width: `${Math.min(100, g.percent)}%` }} />
                </div>
                <p className="mt-1 text-[11px] font-bold text-ink/45">{g.current.toLocaleString("he-IL")} / {g.target.toLocaleString("he-IL")} · {g.percent}%{g.pacePercent != null ? ` · קצב ${g.pacePercent}%` : ""}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
