"use client";
// ============================================================================
// 🧠 ZONO — AI Broker Brain — view (mobile-first RTL, premium). PHASE 50.0.
// Broker states a strategic goal → evidence-backed plan: priorities, approval-
// gated actions, calendar proposals, territory targets, metrics, progress.
// Every action is labeled and approval-gated. Nothing auto-executes.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { runBrokerBrainAction, approveBrokerBrainActionAction } from "@/lib/broker-brain/actions";
import type { BrokerPlan, PlanActionSlot, PlanPriority } from "@/lib/broker-brain/types";

const CHIPS: { label: string; goal: string; icon: string }[] = [
  { label: "10 בלעדיות החודש", goal: "הבא לי 10 נכסים בלעדיים החודש", icon: "Star" },
  { label: "יש לי שעתיים פנויות", goal: "יש לי שעתיים פנויות מה כדאי לעשות", icon: "Clock" },
  { label: "לסגור עסקה השבוע", goal: "איך אני מגדיל סיכוי לסגור עסקה השבוע", icon: "Handshake" },
  { label: "לשלוט באזור", goal: "איך אני שולט באזור שלי", icon: "Map" },
  { label: "מוכרים בסיכון", goal: "יש לי מוכרים בסיכון נטישה", icon: "AlertTriangle" },
  { label: "קונים חמים", goal: "מי הקונים החמים שלי", icon: "Flame" },
];

const IMPACT_CLS: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const IMPACT_HE: Record<string, string> = { high: "השפעה גבוהה", medium: "בינונית", low: "נמוכה" };

export function BrokerBrainView() {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<BrokerPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (text: string) => {
    const g = text.trim();
    if (!g) return;
    setGoal(g); setError(null);
    start(async () => {
      const r = await runBrokerBrainAction(g);
      if (r.error) { setError(r.error); setPlan(null); }
      else if (r.plan) setPlan(r.plan);
    });
  };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      {/* Header */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · מוח הפעולה</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🧠 מוח הברוקר</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">אמור לזונו מטרה אסטרטגית — וקבל תוכנית מבוססת ראיות: עדיפויות, פעולות לאישור, הצעות יומן ויעדי טריטוריה. שום דבר לא מבוצע אוטומטית.</p>
      </div>

      {/* Goal input */}
      <div className="bg-card border-line mt-4 rounded-[20px] border p-3">
        <div className="flex items-center gap-2">
          <input
            value={goal} onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(goal); }}
            placeholder="למשל: ״הבא לי 10 בלעדיות החודש״ / ״יש לי שעתיים פנויות״"
            className="bg-surface border-line text-ink focus:border-brand-light h-11 flex-1 rounded-xl border px-3 text-sm outline-none"
          />
          <Button onClick={() => run(goal)} disabled={pending} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>בנה תוכנית</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.label} onClick={() => run(c.goal)} disabled={pending} className="bg-surface text-ink hover:border-brand-light border-line inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-50">
              <Icon name={c.icon} size={13} />{c.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="bg-danger-soft text-danger mt-4 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {pending && !plan && (
        <div className="text-muted mt-6 flex items-center justify-center gap-2 py-10 text-sm"><Icon name="Loader" size={16} /> זונו מרכיב תוכנית מבוססת ראיות…</div>
      )}

      {plan && <PlanView plan={plan} pending={pending} />}

      {!plan && !pending && (
        <div className="text-muted mt-6 text-center text-[13px]">בחר מטרה מהירה למעלה או כתוב מטרה משלך.</div>
      )}
    </div>
  );
}

function PlanView({ plan, pending }: { plan: BrokerPlan; pending: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      {/* Summary */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-ink text-lg font-black">{plan.headline}</h2>
            <p className="text-muted mt-1 text-[13px]">{plan.summary}</p>
          </div>
          {plan.hasPlan && <span className="bg-brand-soft text-brand shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold">ביטחון {plan.confidence}</span>}
        </div>
        {plan.reasons.length > 0 && <ul className="mt-3 space-y-1">{plan.reasons.map((r, i) => <li key={i} className="text-muted text-[12px]">• {r}</li>)}</ul>}
      </div>

      {/* Priorities */}
      {plan.priorities.length > 0 && (
        <Section title={`עדיפויות (${plan.priorities.length})`} icon="ListChecks">
          <div className="space-y-2">{plan.priorities.map((p) => <PriorityRow key={`${p.rank}-${p.title}`} p={p} />)}</div>
        </Section>
      )}

      {/* Actions */}
      {plan.actions.length > 0 && (
        <Section title={`פעולות מוצעות (${plan.actions.length})`} icon="Send">
          <div className="space-y-2">{plan.actions.map((a) => <ActionRow key={a.id} a={a} pending={pending} />)}</div>
        </Section>
      )}

      {/* Calendar proposals */}
      {plan.calendarProposals.length > 0 && (
        <Section title="הצעות יומן" icon="Calendar">
          <div className="space-y-2">{plan.calendarProposals.map((c, i) => (
            <div key={i} className="bg-surface rounded-xl p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-ink text-[13px] font-bold">{c.title}</span>{c.when && <span className="text-brand-strong text-[12px] font-bold">{c.when}</span>}</div>
              <p className="text-muted mt-0.5 text-[12px]">{c.suggestion}</p>
              <p className="text-muted mt-0.5 text-[11px]">🔒 {c.note}</p>
            </div>
          ))}</div>
        </Section>
      )}

      {/* Territory targets */}
      {plan.territoryTargets.length > 0 && (
        <Section title={`יעדי טריטוריה (${plan.territoryTargets.length})`} icon="Map">
          <div className="space-y-2">{plan.territoryTargets.map((t, i) => (
            <Link key={i} href={t.href} className="bg-surface hover:border-brand-light border-line flex items-center gap-3 rounded-xl border p-3">
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", IMPACT_CLS[t.priority])}>{t.score}</span>
              <div className="min-w-0 flex-1"><p className="text-ink truncate text-[13px] font-bold">{t.label}{t.city ? <span className="text-muted font-normal"> · {t.city}</span> : null}</p><p className="text-muted truncate text-[11px]">{t.why}</p></div>
              <span className="text-brand-strong shrink-0 text-[11px] font-bold">{t.ctaLabel} ↗</span>
            </Link>
          ))}</div>
        </Section>
      )}

      {/* Metrics + progress */}
      {plan.metrics.length > 0 && (
        <Section title="מדדי הצלחה" icon="Target">
          <div className="space-y-2">{plan.metrics.map((m, i) => (
            <div key={i} className="flex items-start justify-between gap-3"><div><p className="text-ink text-[13px] font-bold">{m.label}</p><p className="text-muted text-[11px]">{m.basis}</p></div><span className="text-brand-strong shrink-0 text-[12px] font-black">{m.target}</span></div>
          ))}</div>
          {plan.progress.steps.length > 0 && (
            <div className="border-line mt-3 border-t pt-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-ink text-[12px] font-bold">התקדמות</span><span className="text-muted text-[11px]">{plan.progress.completionPct}%</span></div>
              <ul className="space-y-1">{plan.progress.steps.map((s, i) => <li key={i} className="text-muted flex items-center gap-2 text-[12px]"><Icon name={s.done ? "CheckCircle" : "Minus"} size={13} />{s.label}</li>)}</ul>
              <p className="text-muted mt-2 text-[11px]">{plan.progress.note}</p>
            </div>
          )}
        </Section>
      )}

      {/* Notes */}
      {plan.notes.map((n, i) => <p key={i} className="text-muted rounded-xl px-1 text-[11px] leading-relaxed">🔒 {n}</p>)}
    </div>
  );
}

function PriorityRow({ p }: { p: PlanPriority }) {
  const body = (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink text-[13px] font-bold">{p.rank}. {p.title}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", IMPACT_CLS[p.impact])}>{IMPACT_HE[p.impact]}</span>
      </div>
      <p className="text-muted mt-0.5 text-[12px]">{p.why}</p>
      {p.evidence.length > 0 && <p className="text-muted mt-1 text-[11px]">📎 {p.evidence.join(" · ")}</p>}
    </div>
  );
  return p.entity ? <Link href={p.entity.href} className="block">{body}</Link> : body;
}

function ActionRow({ a, pending }: { a: PlanActionSlot; pending: boolean }) {
  const [state, setState] = useState<{ msg?: string; err?: string; approving?: boolean }>({});
  const approve = (which?: string) => {
    if (!a.bundle) return;
    setState({ approving: true });
    void approveBrokerBrainActionAction({ bundleId: a.bundle.bundleId, which: (which as never) ?? "all" }).then((r) => {
      setState(r.ok ? { msg: r.message ?? "אושר ✓" } : { err: r.error ?? "האישור נכשל" });
    });
  };
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-[13px] font-bold">{a.label}</p>
          <p className="text-muted mt-0.5 text-[12px]">{a.reason}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", a.requiresApproval ? "bg-warning-soft text-warning" : "bg-surface text-muted")}>{a.requiresApproval ? "דורש אישור" : "קישור"}</span>
      </div>

      {a.bundle && a.bundle.actions.length > 0 && (
        <div className="border-line mt-2 border-t pt-2">
          <ul className="mb-2 space-y-0.5">{a.bundle.actions.map((x, i) => <li key={i} className="text-muted text-[11px]">• {x.label}{x.requiresApproval ? " · דורש אישור" : ""}</li>)}</ul>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending || state.approving || !!state.msg} loading={state.approving} onClick={() => approve("all")}>אשר פעולות</Button>
            {a.href && <Link href={a.href} className="text-brand-strong text-[12px] font-bold">פתח ↗</Link>}
          </div>
        </div>
      )}
      {!a.bundle && a.href && <div className="mt-2"><Link href={a.href} className="text-brand-strong text-[12px] font-bold">פתח ↗</Link></div>}
      {state.msg && <p className="text-success mt-2 text-[11px] font-bold">{state.msg}</p>}
      {state.err && <p className="text-danger mt-2 text-[11px] font-bold">{state.err}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name={icon} size={16} /></span><h3 className="text-ink text-sm font-extrabold">{title}</h3></div>
      {children}
    </div>
  );
}
