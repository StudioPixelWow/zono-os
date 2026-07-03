"use client";
// ============================================================================
// 🔁 ZONO — Persistent AI Workflow Builder (UI). 30.4.1.
// Workflows are persisted server-side and survive refresh/deploy. Lists active /
// pending-approval / completed workflows, lets the user continue one, and advances
// it via the server (which — only on approve of an action step — creates a real
// mission/draft, itself approval-gated). NOTHING auto-executes. Value constants
// imported from pure /types only (no server-only leak into the client bundle).
// ============================================================================
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { listWorkflowTemplatesAction, startWorkflowAction, advanceWorkflowAction, getWorkflowAction, listWorkflowsAction } from "@/lib/brokerage-data/actions";
import type { Workflow, WorkflowStep, StepStatus, EntityKind } from "@/lib/workflow-builder/types";
import { ENTITY_HE, STEP_STATUS_HE, WORKFLOW_STATUS_HE, TRIGGER_HE, ACTION_HE } from "@/lib/workflow-builder/types";

interface TemplateSummary { id: string; name: string; entityKind: EntityKind; trigger: string; description: string; expectedOutcome: string; steps: number }
interface SummaryRow { id: string; name: string; entityKind: EntityKind; entityName: string; status: string; percent: number; updatedAt: string; currentStepId: string | null }
const KINDS: EntityKind[] = ["buyer", "seller", "lead", "broker", "office", "property", "mission", "customer"];
const STATUS_TONE: Record<StepStatus, string> = { pending: "text-muted", active: "text-sky-700", waiting_approval: "text-amber-700", completed: "text-emerald-700", blocked: "text-rose-700", cancelled: "text-slate-400", skipped: "text-slate-400" };

export default function WorkflowBuilder() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [tplId, setTplId] = useState("");
  const [kind, setKind] = useState<EntityKind>("buyer");
  const [entityId, setEntityId] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState<SummaryRow[]>([]);
  const [completed, setCompleted] = useState<SummaryRow[]>([]);
  const [wf, setWf] = useState<Workflow | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const refreshLists = useCallback(async () => {
    const [a, c] = await Promise.all([listWorkflowsAction("active"), listWorkflowsAction("completed")]);
    if (a.ok) { setActive(a.result ?? []); if (a.migrationRequired) setMigrationRequired(true); }
    if (c.ok) setCompleted(c.result ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await listWorkflowTemplatesAction();
      if (!alive) return;
      if (t.ok && t.result) { setTemplates(t.result); if (t.result[0]) { setTplId(t.result[0].id); setKind(t.result[0].entityKind); } }
      await refreshLists();
    })();
    return () => { alive = false; };
  }, [refreshLists]);

  const selectedTpl = templates.find((t) => t.id === tplId) ?? null;

  const start = async () => {
    if (!tplId || !entityId.trim() || !name.trim()) { setErr("יש לבחור תבנית ולהזין ישות."); return; }
    setPending(true); setErr(null);
    try {
      const r = await startWorkflowAction(tplId, { entityKind: kind, entityId: entityId.trim(), entityName: name.trim() });
      if (r.ok && r.result) { setWf(r.result); await refreshLists(); } else { if (r.migrationRequired) setMigrationRequired(true); setErr(r.error ?? "נכשל"); }
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };

  const open = async (id: string) => { setPending(true); setErr(null); try { const r = await getWorkflowAction(id); if (r.ok && r.result) setWf(r.result); else setErr(r.error ?? "נכשל"); } finally { setPending(false); } };

  const advance = async (ev: "approve" | "reject" | "cancel", stepId?: string) => {
    if (!wf) return; setPending(true); setErr(null);
    try { const r = await advanceWorkflowAction(wf.id, { kind: ev, stepId }); if (r.ok && r.result) { setWf(r.result); await refreshLists(); } else setErr(r.error ?? "נכשל"); }
    finally { setPending(false); }
  };

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">🔁 בונה התהליכים של ZONO</h1>
        <p className="text-muted text-[13px]">תהליכים נשמרים ושורדים רענון/פריסה. כל צעד פעולה מחייב אישור — אישור יוצר משימה/טיוטה אמיתית (שגם היא ממתינה לאישור). שום דבר לא מתבצע אוטומטית.</p>
      </header>
      {migrationRequired && <p className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-[12px] font-semibold text-amber-800">טבלאות התהליכים חסרות — יש להריץ את מיגרציית 30.4.1 (zono_workflows). עד אז לא ניתן לשמור תהליכים.</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Left rail: start + lists */}
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-ink mb-2 text-sm font-black">התחל תהליך</h2>
            <div className="flex flex-col gap-2 text-[12px]">
              <select value={tplId} onChange={(e) => { setTplId(e.target.value); const t = templates.find((x) => x.id === e.target.value); if (t) setKind(t.entityKind); }} className="rounded-lg border border-line bg-surface px-2 py-1.5">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({ENTITY_HE[t.entityKind]})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={kind} onChange={(e) => setKind(e.target.value as EntityKind)} className="rounded-lg border border-line bg-surface px-2 py-1.5">{KINDS.map((k) => <option key={k} value={k}>{ENTITY_HE[k]}</option>)}</select>
                <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="מזהה" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הישות" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
              {selectedTpl && <p className="text-muted text-[11px]">{selectedTpl.description}</p>}
              <button onClick={start} disabled={pending} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "מפעיל…" : "הפעל תהליך"}</button>
              {err && <span className="text-[11px] font-semibold text-rose-700">{err}</span>}
            </div>
          </section>

          <ListCard title="תהליכים פעילים" rows={active} onOpen={open} currentId={wf?.id} empty="אין תהליכים פעילים." />
          <ListCard title="ארכיון (הושלמו/בוטלו)" rows={completed} onOpen={open} currentId={wf?.id} empty="אין תהליכים בארכיון." />
        </div>

        {/* Detail */}
        <div>
          {!wf && <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted text-[13px]">בחר תהליך מהרשימה או הפעל חדש כדי לראות את ציר הזמן.</div>}
          {wf && <WorkflowDetail wf={wf} pending={pending} onApprove={(id) => advance("approve", id)} onReject={(id) => advance("reject", id)} onCancel={() => advance("cancel")} />}
        </div>
      </div>
    </div>
  );
}

function ListCard({ title, rows, onOpen, currentId, empty }: { title: string; rows: SummaryRow[]; onOpen: (id: string) => void; currentId?: string; empty: string }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <h2 className="text-ink mb-1 text-sm font-black">{title} <span className="text-muted text-[11px]">({rows.length})</span></h2>
      {rows.length === 0 ? <p className="text-muted text-[11px]">{empty}</p> : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)} className={cn("w-full rounded-lg border px-2 py-1.5 text-right text-[11px]", currentId === r.id ? "border-sky-400 bg-sky-50/40" : "border-line")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink font-bold">{r.name} · {r.entityName}</span>
                  <span className="text-muted shrink-0 text-[10px]">{r.percent}%</span>
                </div>
                <span className="text-muted text-[10px]">{WORKFLOW_STATUS_HE[r.status as keyof typeof WORKFLOW_STATUS_HE] ?? r.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkflowDetail({ wf, pending, onApprove, onReject, onCancel }: { wf: Workflow; pending: boolean; onApprove: (id: string) => void; onReject: (id: string) => void; onCancel: () => void }) {
  return (
    <section className="rounded-2xl border-2 border-sky-600/40 bg-sky-50/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-sky-800">{wf.name} — {wf.entityName}</h2>
          <p className="text-muted text-[11px]">סטטוס: <b>{WORKFLOW_STATUS_HE[wf.status]}</b> · התקדמות {wf.progress.percent}% ({wf.progress.completed}/{wf.progress.total}) · טריגר: {TRIGGER_HE[wf.trigger]}</p>
        </div>
        {wf.status !== "completed" && wf.status !== "cancelled" && <button onClick={onCancel} disabled={pending} className="rounded-lg border border-rose-300 px-3 py-1 text-[11px] font-bold text-rose-700 disabled:opacity-60">בטל תהליך</button>}
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-600" style={{ width: `${wf.progress.percent}%` }} /></div>

      <div className="mt-3 rounded-xl border border-indigo-300/50 bg-indigo-50/30 p-3 text-[12px]">
        <p className="text-indigo-800 font-bold">🧠 הסבר · ביטחון {wf.explain.confidence}%</p>
        <p className="text-muted mt-1">{wf.explain.whyStarted}</p>
        {wf.explain.whyWaiting && <p className="text-amber-700">⏳ {wf.explain.whyWaiting}</p>}
        {wf.explain.whyBlocked && <p className="text-rose-700">⛔ {wf.explain.whyBlocked}</p>}
        <p className="text-muted">🎯 תוצאה צפויה: {wf.explain.expectedOutcome}</p>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {wf.steps.map((s) => <StepRow key={s.id} step={s} entityKind={wf.entityKind} entityId={wf.entityId} entityName={wf.entityName} isCurrent={s.id === wf.progress.currentStepId} pending={pending} onApprove={() => onApprove(s.id)} onReject={() => onReject(s.id)} />)}
      </ol>

      <p className="text-muted mt-3 text-[10px]">התהליך נשמר בשרת ושורד רענון. אישור צעד פעולה יוצר משימה/טיוטה אמיתית שגם היא ממתינה לאישור — ZONO אינו מבצע פעולות אוטומטית.</p>
    </section>
  );
}

function StepRow({ step, entityKind, entityId, entityName, isCurrent, pending, onApprove, onReject }: { step: WorkflowStep; entityKind: EntityKind; entityId: string; entityName: string; isCurrent: boolean; pending: boolean; onApprove: () => void; onReject: () => void }) {
  const icon = step.status === "completed" ? "✅" : step.status === "blocked" ? "⛔" : step.status === "cancelled" ? "🚫" : step.status === "waiting_approval" ? "⏳" : step.status === "active" ? "▶️" : "•";
  const draftLink = `/communication-studio?wf=1&kind=${encodeURIComponent(entityKind)}&id=${encodeURIComponent(entityId)}&name=${encodeURIComponent(entityName)}`;
  const isDraftStep = step.action === "CREATE_DRAFT";
  return (
    <li className={cn("rounded-xl border px-3 py-2 text-[12px]", isCurrent ? "border-sky-400 bg-surface" : "border-line bg-surface")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink font-bold">{icon} {step.order}. {step.title}
          <span className={cn("mr-2 text-[10px] font-bold", STATUS_TONE[step.status])}>· {STEP_STATUS_HE[step.status]}</span>
          {step.action && <span className="text-muted text-[10px]"> · {ACTION_HE[step.action]}{step.requiresApproval ? " (אישור)" : ""}</span>}
        </span>
        {step.status === "waiting_approval" && (
          <span className="flex shrink-0 gap-1">
            <button onClick={onApprove} disabled={pending} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-50">אשר</button>
            <button onClick={onReject} disabled={pending} className="rounded border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700 disabled:opacity-50">דחה</button>
          </span>
        )}
      </div>
      {step.why && <p className="text-muted mt-0.5 text-[10px]">{step.why}</p>}
      {step.blockedReason && <p className="text-rose-700 mt-0.5 text-[10px]">{step.blockedReason}</p>}
      {step.outcome && <p className="text-emerald-700 mt-0.5 text-[10px]">{step.outcome}</p>}
      {isDraftStep && (step.status === "waiting_approval" || step.status === "completed") && (
        <Link href={draftLink} className="mt-1 inline-block rounded border border-sky-300 px-2 py-0.5 text-[10px] font-bold text-sky-700" title={`${entityKind}:${entityId} · ${entityName}`}>✉️ פתח בסטודיו התקשורת</Link>
      )}
    </li>
  );
}
