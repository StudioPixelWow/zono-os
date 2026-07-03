"use client";
// 🚀 Universal Mission Engine — office missions (Phase 27.5). Generate missions
// from the office's AI decisions, view tasks/explainability, advance status.
// Nothing auto-executes — every status change is a manual, explicit action.
import { useState } from "react";
import type { Mission, ExecStatus } from "@/lib/mission-engine/types";
import { EXEC_STATUS_HE } from "@/lib/mission-engine/types";
import StartWorkflowButton from "@/components/workflow-builder/StartWorkflowButton";
import type { EntityKind } from "@/lib/workflow-builder/types";
const WF_KINDS = new Set(["buyer", "seller", "lead", "office", "property", "broker", "customer"]);
const asWfKind = (k: string): EntityKind | null => (WF_KINDS.has(k) ? (k as EntityKind) : null);
import { generateOfficeMissionsAction, listOfficeMissionsAction, updateMissionStatusAction } from "@/lib/brokerage-data/actions";

const fmt = (n: number) => n.toLocaleString("he-IL");
const NEXT: Partial<Record<ExecStatus, ExecStatus>> = { WAITING_FOR_APPROVAL: "IN_PROGRESS", READY: "IN_PROGRESS", IN_PROGRESS: "DONE" };
const tone = (s: ExecStatus) => s === "DONE" ? "bg-emerald-50 text-emerald-700" : s === "BLOCKED" ? "bg-rose-50 text-rose-700" : s === "IN_PROGRESS" ? "bg-sky-50 text-sky-700" : s === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700";

export function MissionsSection({ officeId, initial }: { officeId: string; initial: Mission[] }) {
  const [missions, setMissions] = useState<Mission[]>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => { const r = await listOfficeMissionsAction(officeId); if (r.ok) setMissions(r.result ?? []); };
  const generate = async () => {
    setPending("gen"); setErr(null); setNote(null);
    try { const r = await generateOfficeMissionsAction(officeId); if (r.migrationRequired) setErr("טבלת המשימות חסרה — יש להריץ מיגרציית 27.5 (zono_missions)."); else if (r.ok) { setNote(r.note ?? null); await refresh(); } else setErr(r.error ?? "נכשל"); }
    finally { setPending(null); }
  };
  const advance = async (m: Mission, status: ExecStatus) => { setPending(m.id); try { const r = await updateMissionStatusAction(m.id, status); if (r.ok) await refresh(); else setErr(r.error ?? "נכשל"); } finally { setPending(null); } };

  const active = missions.filter((m) => !["DONE", "CANCELLED"].includes(m.status));
  const done = missions.filter((m) => m.status === "DONE");

  return (
    <section className="border-brand/40 bg-brand-soft/10 rounded-2xl border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-brand-strong text-sm font-black">🚀 משימות ביצוע ({fmt(active.length)} פעילות · {fmt(done.length)} הושלמו)</h2>
        <button onClick={generate} disabled={pending != null} className="bg-brand-strong rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-60">{pending === "gen" ? "יוצר…" : "צור משימות מההחלטות"}</button>
      </div>
      {err && <p className="font-semibold text-rose-700">{err}</p>}
      {note && <p className="text-muted text-[11px]">{note}</p>}
      {missions.length === 0 ? (
        <p className="text-muted rounded-xl border border-dashed border-line bg-surface px-3 py-4 text-center text-xs">אין משימות עדיין — צור משימות מההחלטות המומלצות.</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1.5">
          {[...active, ...done].slice(0, 20).map((m) => (
            <div key={m.id} className="border-line bg-surface rounded-xl border px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink font-bold">{m.goal || m.missionType}</span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-surface px-2 py-0.5 font-bold">{m.missionType}</span>
                  <span className="bg-brand-soft/60 rounded-full px-2 py-0.5 font-bold tabular-nums">עדיפות {m.priority}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${tone(m.status)}`}>{EXEC_STATUS_HE[m.status] ?? m.status}</span>
                </span>
              </div>
              <div className="text-emerald-700 mt-0.5 text-[10px]">מדוע: {m.evidence.join(" · ") || m.reason}</div>
              <div className="text-muted mt-0.5 text-[10px]">ROI: {m.explain.expectedRoi} · אם יתעלמו: {m.explain.ifIgnored}</div>
              {m.tasks.length > 0 && <div className="text-muted mt-0.5 text-[10px]"><b>משימות:</b> {m.tasks.map((t) => `${t.status === "DONE" ? "✓" : "•"} ${t.title}`).join(" · ")}</div>}
              {m.followUps.length > 0 && <div className="text-amber-700 mt-0.5 text-[10px]"><b>מעקב:</b> {m.followUps.join(" · ")}</div>}
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {!["DONE", "CANCELLED"].includes(m.status) && NEXT[m.status] && <button onClick={() => advance(m, NEXT[m.status]!)} disabled={pending === m.id} className="bg-brand-strong rounded px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-60">{NEXT[m.status] === "DONE" ? "סמן כהושלם" : "התחל ביצוע"}</button>}
                {!["DONE", "CANCELLED"].includes(m.status) && <button onClick={() => advance(m, "CANCELLED")} disabled={pending === m.id} className="border-line bg-card text-muted rounded border px-2 py-0.5 text-[10px] font-bold disabled:opacity-60">בטל</button>}
                {asWfKind(m.entityType) && m.entityId && <StartWorkflowButton entityType={asWfKind(m.entityType)!} entityId={m.entityId} entityName={m.entityName ?? m.entityType} hints={[m.missionType]} sourceTitle={m.goal || m.missionType} compact />}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
