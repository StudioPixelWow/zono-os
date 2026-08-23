// ============================================================================
// ZONO — OFFICE MANAGER COMMAND CENTER (/office). The room a manager runs the
// office FROM. Priority order: DECISIONS → EXCEPTIONS → PERFORMANCE → INFO.
// IA: compact header · performance strip · "דורש ממך פעולה" (unified decisions +
// approvals, highest weight) · team status · leads/deals at risk · properties
// needing attention · one ZI insight. ALL data from getOfficeManagementBoard
// (real, org-scoped DB). Agents are people (photos everywhere). No fabricated
// targets/response-time/pipeline sums — only metrics the system actually measures.
// Assignment is a real action (AssignMemberPopover); approvals open their real
// route. RTL, ZONO identity.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { SurfaceTabs } from "@/components/navigation/SurfaceTabs";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AssignMemberPopover } from "./AssignMemberPopover";
import { OfficePropertiesStrip } from "./OfficePropertiesStrip";
import { ZonoMark } from "@/components/zono/ZonoMark";
import type { OfficeManagementBoard, OfficeQueue, OfficeDealRow, OfficeAgentCard } from "@/lib/office/management-board";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)]";
const TONE_TEXT: Record<string, string> = { brand: "text-brand-strong", danger: "text-danger", warning: "text-warning", success: "text-success" };
const TONE_CHIP: Record<string, string> = { brand: "bg-brand-soft text-brand-strong", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success" };
const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };
const TONE_RANK: Record<string, number> = { danger: 0, warning: 1, brand: 2, success: 3 };

function ils(n: number | null): string {
  if (n == null) return "—";
  return n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`;
}
function greetingHe(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(now));
  return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}
// Derived agent load level from REAL counts (no fabricated score): overdue work
// dominates, then live pipeline. Documented weights; agent_overloaded ≈ ≥5 overdue.
type LoadLevel = "low" | "balanced" | "high" | "critical";
function loadLevel(a: OfficeAgentCard): LoadLevel {
  const load = a.openLeads + a.activeDeals * 2 + a.activeProperties * 0.5 + a.overdueFollowups * 3;
  if (a.overdueFollowups >= 5 || load >= 26) return "critical";
  if (load >= 16) return "high";
  if (load >= 6) return "balanced";
  return "low";
}
const LOAD_HE: Record<LoadLevel, string> = { low: "פנוי", balanced: "מאוזן", high: "עמוס", critical: "עומס חריג" };
const LOAD_TONE: Record<LoadLevel, string> = { low: "success", balanced: "brand", high: "warning", critical: "danger" };
const LOAD_BAR: Record<LoadLevel, number> = { low: 25, balanced: 55, high: 80, critical: 100 };

function DealRow({ d }: { d: OfficeDealRow }) {
  const STAGE_HE: Record<string, string> = { new: "חדשה", qualified: "מוסמכת", negotiation: "משא ומתן", agreement: "הסכמה", contract: "חוזה", closing: "סגירה" };
  return (
    <div className="border-line flex items-center gap-2.5 rounded-xl border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-bold">{d.title}</p>
        <p className="text-muted flex items-center gap-1.5 truncate text-[11px]">
          {d.agentName && <AgentAvatar url={d.agentAvatarUrl} name={d.agentName} size={16} ring={false} />}
          <span className="truncate">{STAGE_HE[d.stage] ?? d.stage}{d.agentName ? ` · ${d.agentName}` : ""}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span>
        </p>
      </div>
      {d.stuck && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black">תקועה</span>}
      <span className="text-ink shrink-0 text-[13px] font-black tabular-nums">{ils(d.value)}</span>
      <Link href={d.href} className="text-brand-strong shrink-0 text-[11px] font-bold hover:underline">פתח</Link>
    </div>
  );
}

// One unified DECISION card (a canonical queue OR an approval group). Grouped by
// count with a primary action; assignment is a real popover where the queue supports it.
function DecisionCard({ q, agents }: { q: OfficeQueue; agents: OfficeManagementBoard["agentOptions"] }) {
  const first = q.items[0];
  return (
    <div className={`${CARD} flex flex-col gap-2.5 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name={q.icon} size={15} className={TONE_TEXT[q.tone]} />{q.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${TONE_CHIP[q.tone]}`}>{q.count}</span>
      </div>
      {first && <p className="text-muted -mt-1 truncate text-[11.5px]">{first.title}{first.sub ? ` · ${first.sub}` : ""}</p>}
      <div className="flex items-center gap-2">
        {first?.assign
          ? <AssignMemberPopover entityType={first.assign} entityId={first.id} agents={agents} size="sm" label="שייך לסוכן" />
          : <Link href={first?.href ?? q.moreHref} className="bg-brand rounded-lg px-3 py-1.5 text-[12px] font-black text-white transition hover:opacity-95">טפל עכשיו</Link>}
        <Link href={q.moreHref} className="text-brand-strong text-[12px] font-bold hover:underline">הצג את כל {q.count} ←</Link>
      </div>
    </div>
  );
}

export function OfficeManagementCenter({ board }: { board: OfficeManagementBoard }) {
  const now = new Date();
  const dateHe = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(now);
  const s = board.summary;
  const agentCards = board.agents.filter((a) => a.role !== "owner");

  // Unified decisions: canonical queues + approvals, ranked by tone (danger first),
  // capped to what a manager can act on at a glance. Real data only.
  const queueDecisions = [...board.queues].sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9));
  const decisionsTotal = board.queues.reduce((n, q) => n + q.count, 0) + board.approvals.count;

  // Real performance metrics ONLY (the system does not measure monthly targets,
  // avg response-time, or a pipeline ₪ sum — those are intentionally omitted, not faked).
  const METRICS: { label: string; value: number; icon: string; href: string; tone?: string }[] = [
    { label: "סוכנים פעילים", value: s.agents, icon: "Users", href: "/team" },
    { label: "נכסים פעילים", value: s.activeProperties, icon: "Building", href: "/properties" },
    { label: "לידים פתוחים", value: s.activeLeads, icon: "UserPlus", href: "/leads" },
    { label: "עסקאות פעילות", value: s.activeDeals, icon: "Handshake", href: "/deals" },
    { label: "נסגרו החודש", value: board.deals.wonPeriod, icon: "TrendingUp", href: "/deals", tone: "success" },
    { label: "לידים ללא מענה", value: board.leads.unassigned + board.leads.overdue, icon: "AlertTriangle", href: "/leads", tone: (board.leads.unassigned + board.leads.overdue) > 0 ? "danger" : undefined },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-10">
      <SurfaceTabs active="office" isManager />

      {/* ── Compact header ────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-black leading-tight">משרד {board.officeName}</h1>
          <p className="text-muted mt-0.5 text-[13px]">{greetingHe(now)} · תמונת מצב ניהולית · {dateHe}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/team" className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-black text-white transition hover:opacity-95"><Icon name="UserPlus" size={14} />הוסף איש צוות</Link>
          <Link href="/properties/new" className="border-line text-ink hover:border-brand-light bg-card inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="Building" size={14} />נכס</Link>
          <Link href="/leads" className="border-line text-ink hover:border-brand-light bg-card inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="UserPlus" size={14} />שייך ליד</Link>
        </div>
      </header>

      {/* ── Office performance strip (one bar, real metrics only) ─────────────── */}
      <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl">
        {METRICS.map((m) => (
          <Link key={m.label} href={m.href} className={`hover:bg-brand-soft/40 flex min-w-[140px] flex-1 items-center gap-2.5 px-4 py-3 transition ${m.value === 0 && !m.tone ? "opacity-60" : ""}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${m.tone === "danger" ? "bg-danger-soft text-danger" : m.tone === "success" ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong"}`}><Icon name={m.icon} size={17} /></span>
            <div className="min-w-0">
              <div className={`text-[19px] font-black leading-none tabular-nums ${m.tone === "danger" ? "text-danger" : "text-ink"}`}>{m.value}</div>
              <div className="text-muted mt-0.5 truncate text-[11px] font-semibold">{m.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── דורש ממך פעולה — the decision center (highest weight) ─────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Flame" size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-ink text-lg font-black leading-tight">דורש ממך פעולה</h2>
            <p className="text-muted text-[12px]">החלטות והתערבויות שיכולות לקדם את המשרד היום</p>
          </div>
          {decisionsTotal > 0 && <span className="bg-brand-soft text-brand-strong flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black"><ZonoMark size="compact" state="attention" />{decisionsTotal}</span>}
        </div>

        {decisionsTotal === 0 ? (
          <div className="bg-success-soft flex items-center justify-center gap-2 rounded-2xl p-6 text-center">
            <span className="text-success text-xl">🎉</span>
            <div><p className="text-ink text-[14px] font-black">המשרד מתנהל בצורה תקינה כרגע</p><p className="text-muted text-[12px]">ZI ממשיך לעקוב ויתריע כשיידרש טיפול.</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {queueDecisions.map((q) => <DecisionCard key={q.key} q={q} agents={board.agentOptions} />)}
            {board.approvals.count > 0 && (
              <div className={`${CARD} flex flex-col gap-2.5 p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name="CheckCircle" size={15} className="text-brand-strong" />ממתין לאישור שלי</p>
                  <span className="bg-brand-soft text-brand-strong shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black">{board.approvals.count}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {board.approvals.items.slice(0, 3).map((a) => (
                    <li key={a.id}><Link href={a.href} className="border-line hover:bg-surface flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 transition">
                      <span className="min-w-0"><span className="text-ink block truncate text-[12px] font-bold">{a.title}</span><span className="text-muted block truncate text-[11px]">{a.sub}</span></span>
                      <span className={`shrink-0 text-[11px] font-bold ${TONE_TEXT[a.tone] ?? "text-brand-strong"}`}>בדוק ואשר ←</span>
                    </Link></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Team status (uniform grid, manager included) ─────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-2.5"><span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Users" size={18} /></span><div><h2 className="text-ink text-lg font-black leading-tight">מצב הצוות</h2><p className="text-muted text-[12px]">עומס ופעילות לפי סוכן</p></div></div>
          <Link href="/team" className="text-brand-strong flex items-center gap-0.5 text-[13px] font-bold hover:underline">כל הצוות<Icon name="ArrowLeft" size={14} /></Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.manager && (
            <div className={`${CARD} flex items-center gap-3 p-3.5`}>
              <AgentAvatar url={board.manager.avatarUrl} name={board.manager.name} size={44} />
              <div className="min-w-0 flex-1"><p className="text-ink truncate text-[14px] font-black">{board.manager.name}</p><p className="text-brand-strong text-[11.5px] font-bold">{ROLE_HE[board.manager.role] ?? "מנהל/ת המשרד"}</p></div>
              <Link href={`/office/agents/${board.manager.id}`} className="text-brand-strong shrink-0 text-[11.5px] font-bold hover:underline">פרופיל →</Link>
            </div>
          )}
          {agentCards.slice(0, 5).map((a) => {
            const lvl = loadLevel(a);
            return (
              <div key={a.id} className={`${CARD} flex flex-col gap-2 p-3.5`}>
                <div className="flex items-center gap-2.5">
                  <AgentAvatar url={a.avatarUrl} name={a.name} size={40} />
                  <div className="min-w-0 flex-1"><p className="text-ink truncate text-[13.5px] font-black">{a.name}</p><p className="text-muted truncate text-[11px]">{a.specialty || ROLE_HE[a.role] || "מתווך/ת"}</p></div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${TONE_CHIP[LOAD_TONE[lvl]]}`}>{LOAD_HE[lvl]}</span>
                </div>
                <div className="text-muted flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                  <span><b className="text-ink">{a.activeDeals}</b> עסקאות</span>
                  <span><b className="text-ink">{a.openLeads}</b> לידים</span>
                  <span><b className="text-ink">{a.todayMeetings}</b> פגישות</span>
                  {a.overdueFollowups > 0 && <span className="text-danger font-bold">{a.overdueFollowups} באיחור</span>}
                </div>
                <Link href={`/office/agents/${a.id}`} className="text-brand-strong text-[11.5px] font-bold hover:underline">צפה בסוכן ←</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Leads at risk · Deals at risk ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={`${CARD} flex flex-col gap-3 p-4`}>
          <p className="text-ink flex items-center gap-2 text-[14px] font-black"><Icon name="UserPlus" size={16} className="text-danger" />לידים בסיכון</p>
          {board.leads.unassigned === 0 && board.leads.overdue === 0 && board.leads.hot === 0
            ? <p className="text-muted py-2 text-center text-[12px]">אין לידים בסיכון כרגע 🎉</p>
            : (
              <ul className="flex flex-col gap-2">
                {board.leads.unassigned > 0 && <RiskRow icon="AlertTriangle" tone="danger" title="לידים ללא אחראי" sub="ממתינים לשיוך לסוכן" n={board.leads.unassigned} href="/leads" />}
                {board.leads.overdue > 0 && <RiskRow icon="Clock" tone="warning" title="לידים ללא מענה" sub="מעל 3 ימים ללא פעילות" n={board.leads.overdue} href="/leads" />}
                {board.leads.hot > 0 && <RiskRow icon="Flame" tone="danger" title="לידים חמים פעילים" sub="ציון גבוה — עדיפות למענה" n={board.leads.hot} href="/leads" />}
              </ul>
            )}
        </section>

        <section className={`${CARD} flex flex-col gap-3 p-4`}>
          <div className="flex items-center justify-between">
            <p className="text-ink flex items-center gap-2 text-[14px] font-black"><Icon name="Handshake" size={16} className="text-brand-strong" />עסקאות בסיכון</p>
            <Link href="/deals" className="text-brand-strong text-[11.5px] font-bold hover:underline">כל העסקאות</Link>
          </div>
          {board.deals.rows.filter((d) => d.stuck).length === 0 && board.deals.rows.length === 0
            ? <p className="text-muted py-2 text-center text-[12px]">אין עסקאות פעילות</p>
            : <div className="flex flex-col gap-2">{[...board.deals.rows].sort((a, b) => Number(b.stuck) - Number(a.stuck)).slice(0, 3).map((d) => <DealRow key={d.id} d={d} />)}</div>}
        </section>
      </div>

      {/* ── Properties needing attention ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-center gap-2.5"><span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="Building" size={18} /></span><div><h2 className="text-ink text-lg font-black leading-tight">נכסים שדורשים טיפול</h2><p className="text-muted text-[12px]">{board.propertiesTotal} נכסים פעילים במשרד</p></div></div>
          <Link href="/properties" className="text-brand-strong flex items-center gap-0.5 text-[13px] font-bold hover:underline">לכל נכסי המשרד<Icon name="ArrowLeft" size={14} /></Link>
        </div>
        <OfficePropertiesStrip cards={board.properties} agents={board.agentOptions} />
      </section>

      {/* ── Workload (rows, derived load level) ───────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5"><span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="TrendingUp" size={18} /></span><div><h2 className="text-ink text-lg font-black leading-tight">עומס הצוות</h2><p className="text-muted text-[12px]">חלוקת עבודה לפי סוכן — שייך מחדש לאיזון</p></div></div>
        <div className={`${CARD} flex flex-col gap-2.5 p-4`}>
          {agentCards.map((a) => {
            const lvl = loadLevel(a);
            return (
              <div key={a.id} className="flex items-center gap-2.5">
                <AgentAvatar url={a.avatarUrl} name={a.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink truncate text-[13px] font-bold">{a.name}</span>
                    <span className="text-muted shrink-0 text-[11px]">{a.openLeads} לידים · {a.activeProperties} נכסים · {a.activeDeals} עסקאות{a.overdueFollowups > 0 ? <span className="text-danger font-bold"> · {a.overdueFollowups} באיחור</span> : null}</span>
                  </div>
                  <div className="bg-surface mt-1 h-1.5 overflow-hidden rounded-full"><div className={`h-full rounded-full ${LOAD_TONE[lvl] === "danger" ? "bg-danger" : LOAD_TONE[lvl] === "warning" ? "bg-warning" : LOAD_TONE[lvl] === "success" ? "bg-success" : "bg-brand"}`} style={{ width: `${LOAD_BAR[lvl]}%` }} /></div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${TONE_CHIP[LOAD_TONE[lvl]]}`}>{LOAD_HE[lvl]}</span>
              </div>
            );
          })}
          {board.leads.unassigned > 0 && (
            <Link href="/leads" className="border-line text-danger hover:bg-surface mt-1 flex items-center justify-between rounded-xl border border-dashed px-3 py-2 text-[12px] font-bold transition">
              <span className="flex items-center gap-1.5"><Icon name="AlertTriangle" size={13} />לידים ללא אחראי — שייך לאיזון</span>
              <span className="tabular-nums">{board.leads.unassigned} ←</span>
            </Link>
          )}
        </div>
      </section>

      {/* ── One ZI insight ───────────────────────────────────────────────────── */}
      {board.intelligenceTeaser[0] && (
        <Link href="/office/intelligence" className="border-brand-light rounded-[22px] border bg-gradient-to-l from-[var(--color-brand-soft)] to-card p-4 transition hover:brightness-[1.02]">
          <p className="text-brand-strong mb-1 flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={14} />ZI מזהה</p>
          <p className="text-ink min-w-0 text-[13.5px] font-bold">{board.intelligenceTeaser[0].text}</p>
          <span className="text-brand-strong mt-1 inline-block text-[12px] font-bold">הצג את התובנה המלאה →</span>
        </Link>
      )}
    </div>
  );
}

function RiskRow({ icon, tone, title, sub, n, href }: { icon: string; tone: string; title: string; sub: string; n: number; href: string }) {
  return (
    <li><Link href={href} className="border-line hover:bg-surface flex items-center gap-2.5 rounded-xl border px-3 py-2 transition">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon name={icon} size={15} /></span>
      <div className="min-w-0 flex-1"><p className="text-ink truncate text-[12.5px] font-bold">{title}</p><p className="text-muted truncate text-[11px]">{sub}</p></div>
      <span className={`shrink-0 text-[15px] font-black tabular-nums ${TONE_TEXT[tone]}`}>{n}</span>
    </Link></li>
  );
}
