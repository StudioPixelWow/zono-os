// ============================================================================
// 🧭 מרכז הפיקוד הניהולי — the Management COCKPIT (server component).
// ----------------------------------------------------------------------------
// Hierarchy: OFFICE NOW → DECISIONS → MONEY & PIPELINE → TEAM → OPERATIONS.
// A manager grasps office state in ~10s: an executive hero (4 business metrics +
// a DEMOTED, explained health score), a ZONO brief (evidence-gated), a dominant
// pipeline funnel, a bounded decision queue + consolidated risk, a visual team
// leaderboard (drawer in-place), a clearly-separated money composition, today's
// agenda, compact automations and a contextual Ask-ZONO. Presentation only —
// every number comes from the canonical engines; actual/expected/potential are
// never blurred, and nothing (trend, revenue, conversion) is fabricated.
// ============================================================================
import Link from "next/link";
import type { ManagementCockpitBundle } from "@/lib/management/service";
import { teamLeaderboard, type Insight, type RiskCategory, type Funnel, type MoneySplit, type HealthFactor } from "@/lib/management/cockpit";
import { Icon } from "@/components/dashboard/Icon";
import { ManagementTeam } from "./ManagementTeam";
import { AskZono } from "./AskZono";

const ils = (n: number): string => (n <= 0 ? "₪0" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n)}`);
const TREND: Record<string, { icon: string; cls: string }> = { up: { icon: "▲", cls: "text-success" }, down: { icon: "▼", cls: "text-danger" }, flat: { icon: "▪", cls: "text-muted" } };

export function ManagementCockpitView({ bundle }: { bundle: ManagementCockpitBundle }) {
  const d = bundle.cockpit;
  if (!d.hasData) {
    return (
      <div dir="rtl" className="border-line bg-card rounded-2xl border border-dashed p-8 text-center">
        <span className="mb-2 block text-3xl">🧭</span>
        <p className="text-ink text-sm font-black">אין עדיין מספיק נתונים למרכז הניהולי</p>
        <p className="text-muted mt-1 text-xs">התחל לנהל לידים, נכסים ועסקאות — התמונה הניהולית תיבנה כאן.</p>
      </div>
    );
  }
  const attentionRows = teamLeaderboard(bundle.agentCards.map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, activeProperties: a.activeProperties, openLeads: a.openLeads, activeDeals: a.activeDeals, todayMeetings: a.todayMeetings, overdueFollowups: a.overdueFollowups, attention: a.attention })), "attention");

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {/* ── OFFICE NOW: executive hero + demoted health ─────────────────────── */}
      <section className="border-line bg-card bg-gradient-to-bl from-brand-soft/50 to-transparent grid gap-4 rounded-2xl border p-4 sm:p-5 lg:grid-cols-[2.2fr_1fr]">
        <div>
          <p className="text-brand text-[11px] font-black tracking-wide">ZONO · מרכז הפיקוד הניהולי</p>
          <h1 className="text-ink mt-0.5 text-xl font-black sm:text-2xl">{d.managerName ? `בוקר טוב, ${d.managerName}` : "המשרד עכשיו"}</h1>
          <p className="text-muted text-sm">זה מה שקורה במשרד שלך עכשיו</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {d.hero.map((h) => (
              <div key={h.key} className="border-line bg-card rounded-xl border p-3">
                <div className="text-brand-strong text-2xl font-black tabular-nums">{h.kind === "ils" ? ils(h.value) : h.value.toLocaleString("he-IL")}</div>
                <div className="text-muted mt-0.5 text-[11px] font-bold leading-tight">{h.label}</div>
                {h.hint && <div className="text-muted/80 mt-0.5 text-[10px]">{h.hint}</div>}
              </div>
            ))}
          </div>
        </div>
        {d.score && <HealthChip score={d.score} />}
      </section>

      {/* ── ZONO brief + pipeline funnel (dominant) ─────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <ZonoBrief insights={d.insights} />
        <Section title="צנרת העסקאות" subtitle={`${d.funnel.totalCount} עסקאות · ${ils(d.funnel.totalValue)} שווי כולל`} href="/deals" hrefLabel="ניהול עסקאות">
          <PipelineFunnel funnel={d.funnel} />
        </Section>
      </div>

      {/* ── DECISIONS + RISK ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Section title="מחכה להחלטה שלך" subtitle="הפעולות הניהוליות החשובות — מדורג">
          {d.decisions.length === 0
            ? <Empty text="אין כרגע החלטות שדורשות אותך. הכול בשליטה." />
            : <div className="flex flex-col gap-2">{d.decisions.map((dc) => (
                <DecisionRow key={dc.id} headline={dc.headline} why={dc.whyNow} action={dc.action} href={dc.href} />
              ))}</div>}
        </Section>
        <Section title="סיכונים" subtitle="ריכוז ההתראות שדורשות תשומת לב">
          <RiskCenter risks={d.risks} />
        </Section>
      </div>

      {/* ── MONEY + TEAM ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {d.money && <Section title="כסף בתנועה" subtitle="פוטנציאל · צפוי · תקרה — מופרדים">
          <Money money={d.money} />
        </Section>}
        {d.hasTeamAccess
          ? <ManagementTeam performance={d.team.rows} attention={attentionRows} cards={bundle.agentCards} agentOptions={bundle.agentOptions} total={d.team.total} />
          : <Section title="ביצועי הצוות" subtitle=""><Empty text="נתוני הצוות זמינים למנהלי משרד בלבד." /></Section>}
      </div>

      {/* ── OPERATIONS: today · automations · ask ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="היום במשרד" subtitle="הפגישות הקרובות" href="/calendar" hrefLabel="פתח יומן">
          {d.meetings.length === 0
            ? <Empty text="אין פגישות מתוזמנות להיום." />
            : <div className="flex flex-col">{d.meetings.map((m) => (
                <div key={m.id} className="border-line/60 flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <span className="min-w-0"><span className="text-ink block truncate text-xs font-bold">{m.title}</span>{m.agentName && <span className="text-muted block truncate text-[11px]">{m.agentName}</span>}</span>
                  <span className="text-brand-strong shrink-0 text-xs font-black tabular-nums">{m.time}</span>
                </div>
              ))}</div>}
        </Section>
        <Section title="אוטומציות" subtitle="בריאות תפעולית">
          <Automation automation={d.automation} />
        </Section>
        <AskZono />
      </div>
    </div>
  );
}

// ── shared server bits ──────────────────────────────────────────────────────────
function Section({ title, subtitle, href, hrefLabel, children }: { title: string; subtitle?: string; href?: string; hrefLabel?: string; children: React.ReactNode }) {
  return (
    <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="text-ink text-base font-black tracking-tight sm:text-lg">{title}</h2>{subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}</div>
        {href && <Link href={href} prefetch={false} className="text-brand shrink-0 text-xs font-bold">{hrefLabel ?? "פתח"} ←</Link>}
      </div>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) { return <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">{text}</div>; }

function HealthChip({ score }: { score: { overall: number; grade: string; state: string; trend: string; confidence: number; factors: HealthFactor[] } }) {
  const t = TREND[score.trend] ?? TREND.flat;
  const tone = score.overall >= 70 ? "text-success" : score.overall >= 45 ? "text-warning" : "text-danger";
  return (
    <div className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <div className={`text-4xl font-black tabular-nums ${tone}`}>{score.overall}<span className="text-muted text-lg">/100</span></div>
        <div><p className="text-ink text-sm font-black">בריאות המשרד</p><p className="text-muted text-xs">{score.grade} · <span className={t.cls}>{t.icon} {score.trend === "up" ? "עולה" : score.trend === "down" ? "יורד" : "יציב"}</span></p></div>
      </div>
      {score.factors.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="text-brand cursor-pointer font-bold">למה? הגורמים המשפיעים</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {score.factors.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-2">
                <span className="text-muted min-w-0"><span className="text-ink font-bold">{f.label}</span> · {f.basis}</span>
                <span className={`shrink-0 tabular-nums ${f.dragging ? "text-danger" : "text-muted"}`}>{f.score}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ZonoBrief({ insights }: { insights: Insight[] }) {
  return (
    <div className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black">Z</span>
        <div><p className="text-ink text-sm font-black leading-tight">זונו שם לב</p><p className="text-muted text-[11px]">מבוסס-ראיות בלבד</p></div>
      </div>
      {insights.length === 0
        ? <div className="border-line text-muted grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs">אין כרגע נושא שדורש את תשומת ליבך. המשרד בשליטה.</div>
        : <div className="flex flex-col gap-2">{insights.map((i) => (
            <Link key={i.id} href={i.href ?? "#"} prefetch={false} className="border-line hover:bg-surface block rounded-xl border p-3 transition">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${i.tone === "danger" ? "bg-danger" : i.tone === "warning" ? "bg-warning" : i.tone === "success" ? "bg-success" : "bg-brand"}`} />
                <div className="min-w-0"><p className="text-ink text-xs font-black">{i.what}</p><p className="text-muted mt-0.5 text-[11px] leading-relaxed">{i.why}</p>{i.action && <span className="text-brand-strong mt-1 inline-block text-[11px] font-bold">{i.action} ←</span>}</div>
              </div>
            </Link>
          ))}</div>}
    </div>
  );
}

function PipelineFunnel({ funnel }: { funnel: Funnel }) {
  const stages = funnel.stages.filter((s) => s.count > 0);
  if (stages.length === 0) return <Empty text="אין עסקאות פעילות בצנרת." />;
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s) => (
        <div key={s.stage}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-ink font-bold">{s.label}</span>
            <span className="text-muted shrink-0 tabular-nums">{s.count} · {ils(s.value)}</span>
          </div>
          <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${s.pct}%` }} /></div>
        </div>
      ))}
      <p className="text-muted/80 mt-1 text-[10px]">רוחב = מספר עסקאות בשלב. התפלגות נוכחית (לא שיעור המרה — היסטוריית מעברים אינה נמדדת).</p>
    </div>
  );
}

function DecisionRow({ headline, why, action, href }: { headline: string; why: string; action: string; href: string | null }) {
  const inner = (
    <div className="flex items-start gap-3">
      <span className="bg-warning-soft text-warning mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg"><Icon name="AlertTriangle" size={13} /></span>
      <div className="min-w-0 flex-1"><p className="text-ink text-sm font-black">{headline}</p><p className="text-muted mt-0.5 text-xs leading-relaxed">{why}</p></div>
      {action && <span className="text-brand-strong shrink-0 text-xs font-bold">{action} ←</span>}
    </div>
  );
  return href
    ? <Link href={href} prefetch={false} className="border-line hover:border-brand-light hover:bg-surface block rounded-xl border p-3 transition">{inner}</Link>
    : <div className="border-line rounded-xl border p-3">{inner}</div>;
}

function RiskCenter({ risks }: { risks: RiskCategory[] }) {
  if (risks.length === 0) return <Empty text="אין סיכונים פעילים כרגע." />;
  return (
    <div className="flex flex-col gap-2">
      {risks.map((r) => (
        <Link key={r.key} href={r.href} prefetch={false} className="border-line hover:bg-surface flex items-center justify-between gap-2 rounded-xl border p-3 transition">
          <span className="min-w-0"><span className="text-ink block text-sm font-black">{r.label}</span><span className="text-muted block text-[11px]">{r.detail}</span></span>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-black tabular-nums ${r.tone === "danger" ? "bg-danger-soft text-danger" : r.tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand-strong"}`}>{r.count}</span>
        </Link>
      ))}
    </div>
  );
}

function Money({ money }: { money: MoneySplit }) {
  const rows = [
    { label: "פוטנציאל (שווי צנרת)", value: ils(money.potential), tone: "text-ink", hint: "סך שווי העסקאות הפתוחות" },
    { label: "צפוי (עמלה משוקללת)", value: ils(money.expected), tone: "text-brand-strong", hint: "עמלה × הסתברות סגירה" },
    { label: "תקרה (אם הכול ייסגר)", value: ils(money.ceiling), tone: "text-muted", hint: "לא הכנסה — תרחיש עליון" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="border-line flex items-center justify-between gap-2 rounded-xl border p-3">
          <span className="min-w-0"><span className="text-ink block text-xs font-bold">{r.label}</span><span className="text-muted block text-[10px]">{r.hint}</span></span>
          <span className={`shrink-0 text-lg font-black tabular-nums ${r.tone}`}>{r.value}</span>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-surface rounded-xl p-3"><div className="text-ink text-lg font-black tabular-nums">{money.closedCount}</div><div className="text-muted text-[10px] font-bold">עסקאות שנסגרו (30 ימים)</div></div>
        <div className="bg-surface rounded-xl p-3"><div className="text-ink text-lg font-black tabular-nums">{money.avgDeal != null ? ils(money.avgDeal) : "—"}</div><div className="text-muted text-[10px] font-bold">שווי עסקה ממוצע</div></div>
      </div>
      <p className="text-muted/80 text-[10px]">עמלה בפועל שנצברה מוצגת ב-/revenue. כאן: צנרת פעילה בלבד, ללא הצגת פוטנציאל כהכנסה.</p>
    </div>
  );
}

function Automation({ automation }: { automation: { active: number; failed: number; successPct: number | null; healthy: boolean } | null }) {
  if (!automation) return <Empty text="אין אוטומציות מוגדרות." />;
  if (automation.healthy) return (
    <div className="border-success/30 bg-success-soft/40 flex items-center gap-2 rounded-xl border p-4">
      <span className="text-success"><Icon name="CheckCircle" size={18} /></span>
      <div><p className="text-ink text-sm font-black">אוטומציות פועלות תקין</p><p className="text-muted text-[11px]">{automation.active} פעילות{automation.successPct != null ? ` · ${automation.successPct}% הצלחה` : ""}</p></div>
    </div>
  );
  return (
    <div className="border-danger/30 bg-danger-soft/40 rounded-xl border p-4">
      <div className="flex items-center gap-2"><span className="text-danger"><Icon name="AlertTriangle" size={16} /></span><p className="text-ink text-sm font-black">{automation.failed} אוטומציות נכשלו</p></div>
      <p className="text-muted mt-1 text-[11px]">{automation.active} פעילות{automation.successPct != null ? ` · ${automation.successPct}% הצלחה` : ""}</p>
    </div>
  );
}
