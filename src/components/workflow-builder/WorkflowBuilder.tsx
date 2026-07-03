"use client";
// ============================================================================
// 🔁 ZONO — AI Workflow Builder (UI). 30.4. Part 8.
// Pick a template + entity → instantiate a workflow (server, real context) →
// advance it step-by-step CLIENT-SIDE with the same pure engine. Every action
// step is approval-gated; NOTHING executes automatically. Value/engine imports
// come from pure submodules only (no server-only leak into the client bundle).
// ============================================================================
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listWorkflowTemplatesAction, startWorkflowAction } from "@/lib/brokerage-data/actions";
import { advanceWorkflow } from "@/lib/workflow-builder/engine";
import type { Workflow, WorkflowContext, WorkflowStep, StepStatus, EntityKind } from "@/lib/workflow-builder/types";
import { ENTITY_HE, STEP_STATUS_HE, WORKFLOW_STATUS_HE, TRIGGER_HE, ACTION_HE } from "@/lib/workflow-builder/types";

interface TemplateSummary { id: string; name: string; entityKind: EntityKind; trigger: string; description: string; expectedOutcome: string; steps: number }
const KINDS: EntityKind[] = ["buyer", "seller", "lead", "broker", "office", "property", "mission", "customer"];
const STATUS_TONE: Record<StepStatus, string> = {
  pending: "text-muted", active: "text-sky-700", waiting_approval: "text-amber-700", completed: "text-emerald-700", blocked: "text-rose-700", cancelled: "text-slate-400", skipped: "text-slate-400",
};

export default function WorkflowBuilder() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [kind, setKind] = useState<EntityKind>("buyer");
  const [entityId, setEntityId] = useState("");
  const [name, setName] = useState("");
  const [wf, setWf] = useState<Workflow | null>(null);
  const [ctx, setCtx] = useState<WorkflowContext | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await listWorkflowTemplatesAction();
      if (!alive) return;
      if (r.ok && r.result) { setTemplates(r.result); if (r.result[0]) { setTplId(r.result[0].id); setKind(r.result[0].entityKind); } }
      else setErr(r.error ?? "נכשל");
    })();
    return () => { alive = false; };
  }, []);

  const selectedTpl = templates.find((t) => t.id === tplId) ?? null;

  const start = async () => {
    if (!tplId || !entityId.trim() || !name.trim()) { setErr("יש לבחור תבנית ולהזין ישות."); return; }
    setPending(true); setErr(null);
    try {
      const r = await startWorkflowAction(tplId, { entityKind: kind, entityId: entityId.trim(), entityName: name.trim() });
      if (r.ok && r.result) { setWf(r.result.workflow); setCtx(r.result.context); } else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };

  const advance = (kindEvent: "approve" | "reject" | "cancel", stepId?: string) => {
    if (!wf || !ctx) return;
    setWf(advanceWorkflow(wf, { kind: kindEvent, stepId }, ctx));
  };

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">🔁 בונה התהליכים של ZONO</h1>
        <p className="text-muted text-[13px]">מתזמר יכולות קיימות כתהליך מוסבר: טריגר → תנאים → צעדים. כל צעד פעולה מחייב אישור — שום דבר לא מתבצע אוטומטית.</p>
      </header>

      {/* Template + entity picker */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">תבנית תהליך</span>
            <select value={tplId} onChange={(e) => { setTplId(e.target.value); const t = templates.find((x) => x.id === e.target.value); if (t) setKind(t.entityKind); }} className="rounded-lg border border-line bg-surface px-2 py-1.5">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({ENTITY_HE[t.entityKind]})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">סוג ישות</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as EntityKind)} className="rounded-lg border border-line bg-surface px-2 py-1.5">{KINDS.map((k) => <option key={k} value={k}>{ENTITY_HE[k]}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">מזהה ישות</span>
            <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="ID" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">שם</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הישות" className="rounded-lg border border-line bg-surface px-2 py-1.5" />
          </label>
        </div>
        {selectedTpl && <p className="text-muted mt-2 text-[12px]">{selectedTpl.description} · יעד: {selectedTpl.expectedOutcome} · {selectedTpl.steps} צעדים · טריגר: {TRIGGER_HE[selectedTpl.trigger as keyof typeof TRIGGER_HE] ?? selectedTpl.trigger}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={start} disabled={pending} className="rounded-xl bg-sky-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "מפעיל…" : "הפעל תהליך"}</button>
          {err && <span className="text-[12px] font-semibold text-rose-700">{err}</span>}
        </div>
      </section>

      {/* Workflow timeline + progress */}
      {wf && (
        <section className="rounded-2xl border-2 border-sky-600/40 bg-sky-50/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-sky-800">{wf.name} — {wf.entityName}</h2>
              <p className="text-muted text-[11px]">סטטוס: <b>{WORKFLOW_STATUS_HE[wf.status]}</b> · התקדמות {wf.progress.percent}% ({wf.progress.completed}/{wf.progress.total})</p>
            </div>
            {wf.status !== "completed" && wf.status !== "cancelled" && <button onClick={() => advance("cancel")} className="rounded-lg border border-rose-300 px-3 py-1 text-[11px] font-bold text-rose-700">בטל תהליך</button>}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-sky-600" style={{ width: `${wf.progress.percent}%` }} />
          </div>

          {/* Explainability */}
          <div className="mt-3 rounded-xl border border-indigo-300/50 bg-indigo-50/30 p-3 text-[12px]">
            <p className="text-indigo-800 font-bold">🧠 הסבר · ביטחון {wf.explain.confidence}%</p>
            <p className="text-muted mt-1">{wf.explain.whyStarted}</p>
            {wf.explain.whyWaiting && <p className="text-amber-700">⏳ {wf.explain.whyWaiting}</p>}
            {wf.explain.whyBlocked && <p className="text-rose-700">⛔ {wf.explain.whyBlocked}</p>}
            <p className="text-muted">🎯 תוצאה צפויה: {wf.explain.expectedOutcome}</p>
          </div>

          {/* Timeline steps */}
          <ol className="mt-3 flex flex-col gap-2">
            {wf.steps.map((s) => <StepRow key={s.id} step={s} isCurrent={s.id === wf.progress.currentStepId} onApprove={() => advance("approve", s.id)} onReject={() => advance("reject", s.id)} />)}
          </ol>

          <p className="text-muted mt-3 text-[10px]">תהליכים מתקדמים בלחיצת אישור בלבד — ZONO אינו מבצע פעולות אוטומטית. צעדי פעולה שאושרו הופכים להצעות למערכת המתאימה (משימה/טיוטה) שגם היא מחייבת אישור.</p>
        </section>
      )}
    </div>
  );
}

function StepRow({ step, isCurrent, onApprove, onReject }: { step: WorkflowStep; isCurrent: boolean; onApprove: () => void; onReject: () => void }) {
  const icon = step.status === "completed" ? "✅" : step.status === "blocked" ? "⛔" : step.status === "cancelled" ? "🚫" : step.status === "waiting_approval" ? "⏳" : step.status === "active" ? "▶️" : "•";
  return (
    <li className={cn("rounded-xl border px-3 py-2 text-[12px]", isCurrent ? "border-sky-400 bg-surface" : "border-line bg-surface")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink font-bold">{icon} {step.order}. {step.title}
          <span className={cn("mr-2 text-[10px] font-bold", STATUS_TONE[step.status])}>· {STEP_STATUS_HE[step.status]}</span>
          {step.action && <span className="text-muted text-[10px]"> · {ACTION_HE[step.action]}{step.requiresApproval ? " (אישור)" : ""}</span>}
        </span>
        {step.status === "waiting_approval" && (
          <span className="flex shrink-0 gap-1">
            <button onClick={onApprove} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">אשר</button>
            <button onClick={onReject} className="rounded border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700">דחה</button>
          </span>
        )}
      </div>
      {step.why && <p className="text-muted mt-0.5 text-[10px]">{step.why}</p>}
      {step.blockedReason && <p className="text-rose-700 mt-0.5 text-[10px]">{step.blockedReason}</p>}
      {step.outcome && <p className="text-emerald-700 mt-0.5 text-[10px]">{step.outcome}</p>}
    </li>
  );
}
