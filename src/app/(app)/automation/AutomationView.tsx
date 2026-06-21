"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  createWorkflowFromTemplateAction, setWorkflowEnabledAction, runWorkflowAction,
  approveRunAction, rejectRunAction, reverseRunAction, getRunDetailAction,
} from "@/lib/automation/actions";
import {
  categoryLabel, triggerLabel, actionLabel, RUN_STATUS_LABELS,
} from "@/lib/automation/engine";
import type { AutomationCommandCenter, ActionSummary } from "@/lib/automation/service";

type Tab = "center" | "library" | "templates" | "runs" | "health";

const STATUS_TONE: Record<string, string> = {
  pending_review: "bg-warning-soft text-warning", approved: "bg-brand-soft text-brand-strong",
  applied: "bg-success-soft text-success", failed: "bg-danger-soft text-danger",
  blocked: "bg-danger-soft text-danger", reversed: "bg-surface text-muted", rejected: "bg-surface text-muted",
};

export function AutomationView({ cc }: { cc: AutomationCommandCenter }) {
  const [tab, setTab] = useState<Tab>("center");
  const r = useActionRunner();
  const a = cc.analytics;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "center", label: "מרכז פיקוד", icon: "Flame" },
    { id: "library", label: "ספריית תהליכים", icon: "Route" },
    { id: "templates", label: "תבניות", icon: "Presentation" },
    { id: "runs", label: "יומני ריצה", icon: "BarChart3" },
    { id: "health", label: "בריאות", icon: "TrendingUp" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Route" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">אוטומציה ותהליכי עבודה</h1>
          </div>
          <p className="text-muted text-sm">שכבת התזמור של ZONO — מכינה, עוקבת ומתזמרת פעולות. כל אוטומציה מפוקחת אנושית, ניתנת לביטול ומתועדת.</p>
        </div>
        <Link href="/automation/library" className="bg-brand-soft text-brand-strong mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold"><Icon name="Presentation" size={15} />ספריית 595 אוטומציות ←</Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ממתינות לאישור" value={a.pending} icon="Clock" tone="text-warning" />
        <Stat label="הושלמו היום" value={a.completedToday} icon="TrendingUp" tone="text-success" />
        <Stat label="ריצות שנכשלו" value={a.failed} icon="AlertTriangle" tone="text-danger" />
        <Stat label="הזדמנויות שנוצרו" value={a.opportunitiesGenerated} icon="Sparkles" tone="text-brand-strong" />
      </div>

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>

      {tab === "center" && <CenterTab cc={cc} r={r} />}
      {tab === "library" && <LibraryTab cc={cc} r={r} />}
      {tab === "templates" && <TemplatesTab cc={cc} r={r} />}
      {tab === "runs" && <RunsTab cc={cc} r={r} />}
      {tab === "health" && <HealthTab cc={cc} />}
    </main>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`flex items-center gap-1.5 text-[12px] font-bold ${tone}`}><Icon name={icon} size={14} />{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

// ── Command Center ────────────────────────────────────────────────────────────
function CenterTab({ cc, r }: { cc: AutomationCommandCenter; r: Runner }) {
  const pending = cc.runs.filter((x) => x.status === "pending_review");
  return (
    <div className="flex flex-col gap-5">
      {cc.recommendations.length > 0 && (
        <Section title="הזדמנויות אוטומציה מומלצות" icon="Sparkles">
          <div className="flex flex-col gap-2">
            {cc.recommendations.map((rec) => (
              <div key={rec.id} className="bg-brand-soft/40 border-line flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-ink text-sm font-bold">{rec.title}</p>
                  {rec.reason && <p className="text-muted text-[12px]">{rec.reason}</p>}
                </div>
                <span className="bg-card text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">השפעה {rec.impact_score}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="ממתינות לאישור" icon="Clock">
        {pending.length === 0 ? <Empty text="אין ריצות הממתינות לאישור" /> : (
          <div className="flex flex-col gap-2">{pending.map((run) => <RunCard key={run.id} run={run} r={r} canManage />)}</div>
        )}
      </Section>
    </div>
  );
}

// ── Library ───────────────────────────────────────────────────────────────────
function LibraryTab({ cc, r }: { cc: AutomationCommandCenter; r: Runner }) {
  if (cc.workflows.length === 0) return <Empty text="עדיין לא נוצרו תהליכי אוטומציה — התחל מתבנית בלשונית התבניות" />;
  return (
    <div className="flex flex-col gap-3">
      {cc.workflows.map((w) => (
        <div key={w.id} className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-ink font-black">{w.name}</p>
                <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{categoryLabel(w.category)}</span>
                {w.is_enabled
                  ? <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[11px] font-bold">פעיל</span>
                  : <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">מושהה</span>}
              </div>
              {w.description && <p className="text-muted mt-0.5 text-[13px]">{w.description}</p>}
              <p className="text-muted mt-1 text-[12px]">טריגר: {triggerLabel(w.trigger_type)} · ריצות: {w.run_count} · משימות: {w.tasks_generated} · הזדמנויות: {w.opportunities_generated}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={r.busyId === `run-${w.id}`}
              onClick={() => r.run(async () => { const res = await runWorkflowAction(w.id, { entity_label: "הרצה ידנית" }); if (res.error) throw new Error(res.error); return res; }, { id: `run-${w.id}`, pendingMessage: "מכין ריצה...", success: (x) => x.message ?? null })}>
              <Icon name="Send" size={14} />הרץ עכשיו
            </Button>
            {cc.isManager && (
              <Button size="sm" variant="ghost" loading={r.busyId === `tg-${w.id}`}
                onClick={() => r.run(async () => { const res = await setWorkflowEnabledAction(w.id, !w.is_enabled); if (res.error) throw new Error(res.error); return res; }, { id: `tg-${w.id}`, success: (x) => x.message ?? null })}>
                <Icon name={w.is_enabled ? "Pause" : "Power"} size={14} />{w.is_enabled ? "השהה" : "הפעל"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Templates ─────────────────────────────────────────────────────────────────
function TemplatesTab({ cc, r }: { cc: AutomationCommandCenter; r: Runner }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cc.templates.map((t) => (
        <div key={t.template_key} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Presentation" size={14} /></span>
            <p className="text-ink font-black">{t.name}</p>
          </div>
          {t.description && <p className="text-muted text-[13px]">{t.description}</p>}
          <p className="text-muted text-[12px]">טריגר: {triggerLabel(t.trigger_type)} · {categoryLabel(t.category)}</p>
          <div className="flex flex-wrap gap-1">
            {t.default_steps.map((s, i) => (
              <span key={i} className="bg-surface text-ink rounded-full px-2 py-0.5 text-[11px] font-semibold">{i + 1}. {actionLabel(s.action_type)}</span>
            ))}
          </div>
          {cc.isManager ? (
            <Button size="sm" className="mt-1 w-fit" loading={r.busyId === `tpl-${t.template_key}`}
              onClick={() => r.run(async () => { const res = await createWorkflowFromTemplateAction(t.template_key); if (res.error) throw new Error(res.error); return res; }, { id: `tpl-${t.template_key}`, pendingMessage: "יוצר תהליך...", success: (x) => x.message ?? null })}>
              <Icon name="Plus" size={14} />צור תהליך מתבנית
            </Button>
          ) : <p className="text-muted mt-1 text-[11px]">רק מנהל יכול ליצור תהליך</p>}
        </div>
      ))}
    </div>
  );
}

// ── Runs / logs ───────────────────────────────────────────────────────────────
function RunsTab({ cc, r }: { cc: AutomationCommandCenter; r: Runner }) {
  if (cc.runs.length === 0) return <Empty text="עדיין אין ריצות" />;
  return <div className="flex flex-col gap-2">{cc.runs.map((run) => <RunCard key={run.id} run={run} r={r} canManage expandable />)}</div>;
}

function RunCard({ run, r, canManage, expandable }: { run: AutomationCommandCenter["runs"][number]; r: Runner; canManage: boolean; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ actions: ActionSummary[]; logs: { level: string; message: string; created_at: string; step_action_type: string | null }[] } | null>(null);

  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && !detail) { try { setDetail(await getRunDetailAction(run.id)); } catch { /* silent */ } }
  };

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-ink text-sm font-black">{run.workflow_name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[run.status] ?? "bg-surface text-muted"}`}>{RUN_STATUS_LABELS[run.status] ?? run.status}</span>
          </div>
          <p className="text-muted mt-0.5 text-[12px]">
            {triggerLabel(run.trigger_type)}{run.entity_label ? ` · ${run.entity_label}` : ""} · הוכנו {run.actions_prepared} · הוחלו {run.actions_applied}
          </p>
          {run.blocked_reason && <p className="text-danger mt-0.5 text-[12px]">{run.blocked_reason}</p>}
          {run.error_message && <p className="text-danger mt-0.5 text-[12px]">{run.error_message}</p>}
        </div>
        {expandable && <button onClick={toggle} className="text-brand-strong text-[12px] font-bold">{open ? "סגור" : "פרטים"}</button>}
      </div>

      {canManage && (run.status === "pending_review" || run.status === "approved") && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={r.busyId === `ap-${run.id}`}
            onClick={() => r.run(async () => { const res = await approveRunAction(run.id); if (res.error) throw new Error(res.error); return res; }, { id: `ap-${run.id}`, pendingMessage: "מאשר ומיישם...", success: (x) => x.message ?? null })}>
            <Icon name="Send" size={14} />אשר והחל
          </Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `rj-${run.id}`}
            onClick={() => r.run(async () => { const res = await rejectRunAction(run.id); if (res.error) throw new Error(res.error); return res; }, { id: `rj-${run.id}`, success: (x) => x.message ?? null })}>
            <Icon name="Minus" size={14} />דחה
          </Button>
        </div>
      )}
      {canManage && run.status === "applied" && (
        <div className="mt-3">
          <Button size="sm" variant="danger" loading={r.busyId === `rv-${run.id}`}
            onClick={() => r.run(async () => { const res = await reverseRunAction(run.id); if (res.error) throw new Error(res.error); return res; }, { id: `rv-${run.id}`, pendingMessage: "מבטל...", success: (x) => x.message ?? null })}>
            <Icon name="ArrowLeft" size={14} />בטל ריצה
          </Button>
        </div>
      )}

      {open && detail && (
        <div className="border-line mt-3 flex flex-col gap-3 border-t pt-3">
          {detail.actions.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold">פעולות שהוכנו</p>
              <div className="flex flex-col gap-1">
                {detail.actions.map((act) => (
                  <div key={act.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink">{act.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[act.status] ?? "bg-surface text-muted"}`}>{act.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {detail.logs.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold">יומן ריצה</p>
              <ol className="flex flex-col gap-0.5">
                {detail.logs.map((l, i) => (
                  <li key={i} className={`text-[12px] ${l.level === "error" ? "text-danger" : l.level === "warning" ? "text-warning" : l.level === "success" ? "text-success" : "text-muted"}`}>• {l.message}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Health ────────────────────────────────────────────────────────────────────
function HealthTab({ cc }: { cc: AutomationCommandCenter }) {
  const a = cc.analytics;
  const rows: { label: string; value: number }[] = [
    { label: "תהליכים שנוצרו", value: a.workflowsTotal },
    { label: "תהליכים פעילים", value: a.workflowsEnabled },
    { label: "ריצות שבוצעו", value: a.runsTotal },
    { label: "ריצות שהוחלו", value: a.runsApplied },
    { label: "משימות שנוצרו", value: a.tasksGenerated },
    { label: "הזדמנויות שנוצרו", value: a.opportunitiesGenerated },
    { label: "ריצות שנכשלו", value: a.failed },
    { label: "ריצות חסומות", value: a.blocked },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
          <span className="text-muted text-[12px] font-bold">{row.label}</span>
          <span className="text-ink text-2xl font-black">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── shared ────────────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name={icon} size={17} />{title}</h2>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>;
}
