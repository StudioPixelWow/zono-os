"use client";
// ============================================================================
// ⚡ ZONO — Automation OS™ view. SCREEN 15. Premium automation command center.
// Cinematic health hero + what-ZONO-prepared strip + a command center (suggested
// / waiting-for-approval / in-progress / completed-today / blocked). Everything
// stays approval-gated: nothing auto-sends, auto-publishes or auto-books. All
// data is REUSED from Automation OS — no fabricated results, no fake time-saved.
// ============================================================================
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
import { categoryLabel, triggerLabel, actionLabel, RUN_STATUS_LABELS } from "@/lib/automation/engine";
import type { AutomationCommandCenter, ActionSummary } from "@/lib/automation/service";
import type { AutomationHealth } from "@/lib/automation-os/unify";

type Tab = "center" | "library" | "templates" | "runs";

const STATUS_TONE: Record<string, string> = {
  pending_review: "bg-warning-soft text-warning", approved: "bg-brand-soft text-brand-strong",
  applied: "bg-success-soft text-success", failed: "bg-danger-soft text-danger",
  blocked: "bg-danger-soft text-danger", reversed: "bg-surface text-muted", rejected: "bg-surface text-muted",
};
const STATE_HE: Record<string, string> = { healthy: "תקין", needs_attention: "דורש תשומת לב", at_risk: "בסיכון", idle: "לא פעיל" };
const STATE_TONE: Record<string, string> = { healthy: "bg-success-soft text-success", needs_attention: "bg-warning-soft text-warning", at_risk: "bg-danger-soft text-danger", idle: "bg-line/70 text-muted" };
const rateTone = (n: number) => (n >= 80 ? "text-success" : n >= 55 ? "text-brand" : n >= 30 ? "text-warning" : "text-danger");

export function AutomationView({ cc, health }: { cc: AutomationCommandCenter; health: AutomationHealth | null }) {
  const [tab, setTab] = useState<Tab>("center");
  const r = useActionRunner();
  const a = cc.analytics;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "center", label: "מרכז פיקוד", icon: "Zap" },
    { id: "library", label: "התהליכים שלי", icon: "Route" },
    { id: "templates", label: "תבניות", icon: "Presentation" },
    { id: "runs", label: "יומני ריצה", icon: "BarChart3" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      {/* ── Cinematic health hero ───────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-card text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Zap" size={18} /></span>
              <div>
                <p className="text-brand text-xs font-bold">ZONO Automation OS</p>
                <h1 className="text-ink text-2xl font-black sm:text-3xl">מרכז האוטומציות</h1>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {health && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATE_TONE[health.state]}`}>{STATE_HE[health.state] ?? health.state}</span>}
              <span className="bg-card text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">כל אוטומציה מאושרת אנושית · ניתנת לביטול</span>
            </div>
            {health?.evidence?.[0] && <p className="text-ink mt-2 max-w-xl text-[13px] font-semibold leading-relaxed">{health.evidence[0]}</p>}
          </div>
          {health && (
            <div className="bg-card grid h-24 w-24 shrink-0 place-items-center rounded-full text-center shadow-[var(--shadow-soft)]">
              <div><div className={`text-3xl font-black leading-none ${rateTone(health.successRate)}`}>{health.successRate}%</div><div className="text-muted mt-1 text-[10px] font-bold">הצלחה</div></div>
            </div>
          )}
        </div>
        {/* What ZONO prepared for you (real counts — never fabricated time) */}
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Prepared label="הושלמו היום" value={a.completedToday} tone="text-success" />
          <Prepared label="ממתינות לאישורך" value={a.pending} tone={a.pending ? "text-warning" : "text-muted"} />
          <Prepared label="משימות שהוכנו" value={a.tasksGenerated} tone="text-brand-strong" />
          <Prepared label="הזדמנויות שנוצרו" value={a.opportunitiesGenerated} tone="text-brand-strong" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-sm">שכבת התזמור של ZONO — מכינה, עוקבת ומתזמרת פעולות. כלום לא נשלח, מתפרסם או נקבע ללא אישורך.</p>
        <Link href="/automation/library" className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold"><Icon name="Presentation" size={15} />ספריית 595 ←</Link>
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
    </main>
  );
}

function Prepared({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line border-t p-4 text-center sm:border-r sm:border-t-0 sm:first:border-r-0">
      <p className={`text-2xl font-black ${tone}`}>{value}</p>
      <p className="text-muted mt-0.5 text-[11px] font-bold">{label}</p>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

// ── Command Center ────────────────────────────────────────────────────────────
function CenterTab({ cc, r }: { cc: AutomationCommandCenter; r: Runner }) {
  const pending = cc.runs.filter((x) => x.status === "pending_review");
  const inProgress = cc.runs.filter((x) => x.status === "approved");
  const doneToday = cc.runs.filter((x) => x.status === "applied").slice(0, 6);
  const problems = cc.runs.filter((x) => x.status === "blocked" || x.status === "failed");

  const nothing = pending.length === 0 && inProgress.length === 0 && doneToday.length === 0 && problems.length === 0 && cc.recommendations.length === 0;
  if (nothing) {
    return (
      <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
        <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Zap" size={28} /></span>
        <p className="text-ink text-lg font-extrabold">אין אוטומציות פעילות כרגע</p>
        <p className="text-muted max-w-sm text-sm">הפעילו תהליך מתוך התבניות או הספרייה — ZONO יכין עבורכם פעולות לאישור, מבלי לבצע דבר אוטומטית.</p>
        <Link href="/automation/library" className="bg-brand mt-1 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white">עיין בספריית האוטומציות</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Suggested */}
      {cc.recommendations.length > 0 && (
        <Section title="אוטומציות מומלצות להפעלה" icon="Sparkles" count={cc.recommendations.length}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cc.recommendations.map((rec) => (
              <div key={rec.id} className="bg-brand-soft/40 border-line flex items-center justify-between gap-3 rounded-2xl border p-3">
                <div className="min-w-0"><p className="text-ink text-sm font-bold">{rec.title}</p>{rec.reason && <p className="text-muted text-[12px]">{rec.reason}</p>}</div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="bg-card text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">השפעה {rec.impact_score}</span>
                  {cc.isManager && rec.template_key && (
                    <Button size="sm" loading={r.busyId === `rec-${rec.id}`}
                      onClick={() => r.run(async () => { const res = await createWorkflowFromTemplateAction(rec.template_key!); if (res.error) throw new Error(res.error); return res; }, { id: `rec-${rec.id}`, pendingMessage: "יוצר תהליך...", success: (x) => x.message ?? null })}>
                      <Icon name="Plus" size={13} />הפעל
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Waiting for approval — the main action */}
      <Section title="ממתין לאישורך" icon="Clock" count={pending.length}>
        {pending.length === 0 ? <Empty text="אין ריצות הממתינות לאישור ✓" /> : (
          <div className="flex flex-col gap-2">{pending.map((run) => <RunCard key={run.id} run={run} r={r} canManage />)}</div>
        )}
      </Section>

      {/* In progress */}
      {inProgress.length > 0 && (
        <Section title="בתהליך" icon="Route" count={inProgress.length}>
          <div className="flex flex-col gap-2">{inProgress.map((run) => <RunCard key={run.id} run={run} r={r} canManage />)}</div>
        </Section>
      )}

      {/* Completed today */}
      <Section title="הושלמו היום" icon="TrendingUp">
        {doneToday.length === 0 ? <Empty text="עדיין לא הושלמו אוטומציות היום." /> : (
          <div className="flex flex-col gap-2">{doneToday.map((run) => <RunCard key={run.id} run={run} r={r} canManage />)}</div>
        )}
      </Section>

      {/* Blocked / failed */}
      {problems.length > 0 && (
        <Section title="חסומות / נכשלו" icon="AlertTriangle" count={problems.length}>
          <div className="flex flex-col gap-2">{problems.map((run) => <RunCard key={run.id} run={run} r={r} canManage />)}</div>
        </Section>
      )}
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
        <div className="min-w-0">
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
        {expandable && <button onClick={toggle} className="text-brand-strong shrink-0 text-[12px] font-bold">{open ? "סגור" : "פרטים"}</button>}
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

// ── shared ────────────────────────────────────────────────────────────────────
function Section({ title, icon, count, children }: { title: string; icon: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink flex items-center gap-2 text-[15px] font-black"><span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={15} /></span>{title}{count != null ? ` (${count})` : ""}</h2>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="bg-card border-line text-muted rounded-2xl border px-4 py-8 text-center text-sm font-bold">{text}</div>;
}
