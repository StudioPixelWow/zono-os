"use client";
// ============================================================================
// ZONO — Manager/Owner Command Center board (client). "איפה המשרד צריך אותי?" —
// an EXCEPTION + DECISION screen, not analytics/surveillance/leaderboard. One
// primary decision, a short critical queue (with agent attribution, aging, one
// CTA, inline lead reassignment), office-health dimensions, and a rail of approvals
// / team-load / ZI shortcuts. Tabs keep the manager's personal day ("היום שלי")
// distinct from the office ("המשרד"). Execution routes into existing engines;
// consequential actions confirm. Desktop uses width; mobile is a touch stack. RTL.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { reassignLeadAction, recordManagerExceptionOpenedAction } from "@/lib/office/manager-actions";
import {
  DIMENSION_LABEL, HEALTH_LABEL, type ManagerCommandCenter, type ManagerException, type DimensionHealth,
} from "@/lib/office/manager-core";

const HEALTH_TONE: Record<string, string> = { ok: "bg-success-soft text-success", attention: "bg-warning-soft text-warning", critical: "bg-danger-soft text-danger" };
const PRI_DOT: Record<string, string> = { P0: "bg-danger", P1: "bg-warning", P2: "bg-muted/50" };

function track(type: string) { void recordManagerExceptionOpenedAction(type); }

function ExceptionRow({ e, agents, onReassigned }: { e: ManagerException; agents: { id: string; name: string }[]; onReassigned: () => void }) {
  const [busy, start] = useTransition();
  const canReassign = e.entityType === "lead" && agents.length > 0;

  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRI_DOT[e.priority]}`} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink text-sm font-extrabold">{e.title}</p>
            {e.canPrepare && <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">ZONO יכול להכין</span>}
          </div>
          <p className="text-muted text-sm">{e.subtitle}</p>
          <div className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {e.agingLabel && <span className="text-warning font-bold">{e.agingLabel}</span>}
            {e.agentName ? <span>סוכן: {e.agentName}</span> : e.entityType === "lead" ? <span className="text-danger font-bold">ללא אחראי</span> : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canReassign && (
          <select
            defaultValue=""
            disabled={busy}
            onChange={(ev) => { const v = ev.target.value; if (!v) return; start(async () => { await reassignLeadAction(e.entityId!, v); onReassigned(); }); }}
            className="border-line bg-surface text-ink rounded-xl border px-2 py-1.5 text-xs"
          >
            <option value="">העבר לסוכן…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <Link href={e.route} onClick={() => track(e.type)} className="bg-brand-soft text-brand shrink-0 rounded-xl px-4 py-2 text-xs font-bold">{e.cta}</Link>
      </div>
    </div>
  );
}

function HealthChip({ h }: { h: DimensionHealth }) {
  return (
    <div className={`rounded-2xl p-3 ${HEALTH_TONE[h.status]}`}>
      <p className="text-xs font-black">{DIMENSION_LABEL[h.dimension]}</p>
      <p className="text-[11px] font-bold opacity-90">{HEALTH_LABEL[h.status]}</p>
    </div>
  );
}

export function OfficeCommandCenter({ center, agents }: { center: ManagerCommandCenter; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const refresh = () => start(() => router.refresh());
  const [tab] = useState<"office">("office");
  const dateHe = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());

  const s = center.summary;
  const properties = center.groups.properties;
  const deals = center.groups.deals;
  const approvals = center.groups.marketing.filter((e) => e.type === "marketing_plan_waiting_approval" || e.type === "marketing_plan_failed");
  const team = center.groups.team;

  return (
    <div dir="rtl" className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
      {/* Tabs — personal day vs office (kept distinct) */}
      <div className="border-line flex items-center gap-1 rounded-2xl border p-1 self-start text-sm font-bold">
        <Link href="/today/plan" className="text-muted rounded-xl px-4 py-2 hover:bg-surface">היום שלי</Link>
        <span className={`rounded-xl px-4 py-2 ${tab === "office" ? "bg-brand text-white" : "text-muted"}`}>המשרד</span>
      </div>

      <header>
        <p className="text-muted text-sm font-semibold">{dateHe}</p>
        <h1 className="text-ink mt-1 text-2xl font-black">{center.headline}</h1>
      </header>

      {/* Office health dimensions (no opaque score) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {center.health.map((h) => <HealthChip key={h.dimension} h={h} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* MAIN */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Primary decision */}
          {center.nextDecision ? (
            <div className="bg-brand text-white rounded-[24px] p-5">
              <p className="text-xs font-bold opacity-80">ההחלטה הראשונה</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{center.nextDecision.title}</p>
                  <p className="truncate text-sm opacity-90">{center.nextDecision.subtitle}{center.nextDecision.agentName ? ` · ${center.nextDecision.agentName}` : ""}</p>
                </div>
                <Link href={center.nextDecision.route} onClick={() => track(center.nextDecision!.type)} className="text-brand shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-extrabold">{center.nextDecision.cta}</Link>
              </div>
            </div>
          ) : (
            <div className="bg-success-soft rounded-[24px] p-6 text-center">
              <div className="text-3xl">✓</div>
              <p className="text-ink mt-2 text-base font-black">המשרד בשליטה</p>
              <p className="text-muted mt-1 text-sm">אין חריגים שדורשים אותך כרגע.</p>
            </div>
          )}

          {/* Summary counts */}
          <div className="border-line bg-card grid grid-cols-3 gap-px overflow-hidden rounded-[20px] border sm:grid-cols-5">
            <Stat n={s.needsAttention} label="דורשים טיפול" tone="danger" />
            <Stat n={s.unassignedLeads} label="לידים ללא אחראי" tone="warning" />
            <Stat n={s.staleDeals} label="עסקאות תקועות" tone="warning" />
            <Stat n={s.propertiesNotMarketed} label="נכסים ללא שיווק" tone="warning" />
            <Stat n={s.plansAwaiting} label="לאישור" tone="brand" />
          </div>

          {/* Critical queue */}
          {center.critical.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name="AlertTriangle" size={15} className="text-danger" />דורש טיפול <span className="text-muted font-normal">· {center.critical.length}</span></h2>
              {center.critical.map((e) => <ExceptionRow key={e.id} e={e} agents={agents} onReassigned={refresh} />)}
            </section>
          )}

          {/* Attention (P1) */}
          {center.attention.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-ink flex items-center gap-1.5 text-sm font-black"><Icon name="Clock" size={15} className="text-warning" />כדאי לטפל היום <span className="text-muted font-normal">· {center.attention.length}</span></h2>
              {center.attention.slice(0, 12).map((e) => <ExceptionRow key={e.id} e={e} agents={agents} onReassigned={refresh} />)}
            </section>
          )}

          {/* Properties + Deals quick sections (already within the queues, shown grouped) */}
          {(properties.length > 0 || deals.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GroupList title="נכסים" icon="Home" items={properties} />
              <GroupList title="עסקאות" icon="Briefcase" items={deals} />
            </div>
          )}
        </div>

        {/* RAIL */}
        <aside className="flex flex-col gap-4 lg:col-span-1">
          {approvals.length > 0 && (
            <div className="bg-card border-line rounded-[22px] border p-5">
              <p className="text-ink mb-3 text-sm font-black">תוכניות שיווק לאישור</p>
              <ul className="flex flex-col gap-2">
                {approvals.map((e) => (
                  <li key={e.id}><Link href={e.route} onClick={() => track(e.type)} className="border-line hover:bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm">
                    <span className="text-ink truncate font-bold">{e.title}</span>
                    <span className={`shrink-0 text-xs font-bold ${e.priority === "P0" ? "text-danger" : "text-brand"}`}>{e.cta} ←</span>
                  </Link></li>
                ))}
              </ul>
            </div>
          )}

          {team.length > 0 && (
            <div className="bg-card border-line rounded-[22px] border p-5">
              <p className="text-ink mb-1 text-sm font-black">עומס בצוות</p>
              <p className="text-muted mb-3 text-xs">תפעולי בלבד — לא דירוג.</p>
              <ul className="flex flex-col gap-2">
                {team.map((e) => <li key={e.id} className="text-ink flex items-center justify-between text-sm"><span>{e.title}</span><span className="text-muted text-xs">{e.subtitle}</span></li>)}
              </ul>
            </div>
          )}

          <div className="bg-card border-line rounded-[22px] border p-5">
            <p className="text-ink mb-3 text-sm font-black">שאל את ZI</p>
            <p className="text-muted text-sm">{`איפה יש בעיות במשרד? · מי מחכה יותר מדי? · מה אני צריך לעשות ראשון?`}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "danger" | "brand" | "warning" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-brand";
  return <div className="bg-card flex flex-col items-center justify-center px-2 py-4 text-center"><span className={`text-2xl font-black ${c}`}>{n}</span><span className="text-muted text-[11px] font-semibold">{label}</span></div>;
}

function GroupList({ title, icon, items }: { title: string; icon: string; items: ManagerException[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-2 flex items-center gap-1.5 text-sm font-black"><Icon name={icon} size={14} className="text-muted" />{title}</p>
      <ul className="flex flex-col gap-2">
        {items.slice(0, 6).map((e) => (
          <li key={e.id}><Link href={e.route} onClick={() => track(e.type)} className="hover:bg-surface -mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-1.5">
            <span className="min-w-0"><span className="text-ink block truncate text-sm font-bold">{e.title}</span><span className="text-muted block truncate text-xs">{e.subtitle}</span></span>
            <span className="text-brand shrink-0 text-xs font-bold">←</span>
          </Link></li>
        ))}
      </ul>
    </div>
  );
}
