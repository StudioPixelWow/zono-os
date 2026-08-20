// ============================================================================
// ZONO — OFFICE MANAGEMENT HOME (/office). The manager/owner brokerage home:
// a premium, compact, real-estate-first operating surface —
//   A header · B KPI strip · C My Agents (dominant) · D office properties ·
//   E Management Pulse (leads / deals / attention) · F management rail
//     (quick actions · today's meetings · office insight · recent activity).
// Server component; ALL data comes from getOfficeManagementBoard (real DB only).
// The old exceptions command center is demoted into the attention pulse card.
// Fits ~1–1.5 desktop viewports. RTL. ZONO identity (white / lavender / purple).
// ============================================================================
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { SurfaceTabs } from "@/components/navigation/SurfaceTabs";
import type { OfficeManagementBoard, OfficeAgentCard, OfficeDealRow } from "@/lib/office/management-board";
import { OfficePropertiesStrip } from "./OfficePropertiesStrip";
import { OfficeAttentionCompact } from "./OfficeAttentionCompact";

const CARD = "bg-card border-line rounded-[22px] border shadow-[var(--shadow-card)]";
const TONE_TEXT: Record<string, string> = { brand: "text-brand-strong", danger: "text-danger", warning: "text-warning", success: "text-success" };
const ROLE_HE: Record<string, string> = { owner: "מנהל/ת משרד", manager: "מנהל/ת", agent: "מתווך/ת" };

function greetingHe(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(now));
  return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
function ils(n: number | null): string {
  if (n == null) return "—";
  return n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : `₪${Math.round(n / 1000)}K`;
}

function SectionHead({ title, sub, icon, href, hrefLabel }: { title: string; sub?: string; icon: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={18} /></span>
        <div>
          <h2 className="text-ink text-lg font-black leading-tight">{title}</h2>
          {sub && <p className="text-muted text-[12px]">{sub}</p>}
        </div>
      </div>
      {href && <Link href={href} className="text-brand-strong flex shrink-0 items-center gap-0.5 text-[13px] font-bold hover:underline">{hrefLabel ?? "הצג הכל"}<Icon name="ArrowLeft" size={14} /></Link>}
    </div>
  );
}

// ── C — My Agents (dominant) ──────────────────────────────────────────────────
function AgentCard({ a }: { a: OfficeAgentCard }) {
  const metric = (label: string, value: number, icon: string) => (
    <div className="flex items-center gap-1.5"><Icon name={icon} size={13} className="text-muted" /><span className="text-ink text-[13px] font-black tabular-nums">{value}</span><span className="text-muted text-[11px]">{label}</span></div>
  );
  const needs = a.attention > 0;
  return (
    <div className={`${CARD} flex w-[78%] shrink-0 snap-start flex-col gap-3 p-4 sm:w-auto`}>
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand-strong grid h-11 w-11 shrink-0 place-items-center rounded-full text-[15px] font-black">{initials(a.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-black">{a.name}</p>
          <p className="text-muted truncate text-[12px]">{a.specialty || ROLE_HE[a.role] || "מתווך/ת"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {metric("נכסים", a.activeProperties, "Building")}
        {metric("לידים", a.openLeads, "Users")}
        {metric("עסקאות", a.activeDeals, "Handshake")}
        {metric("פגישות היום", a.todayMeetings, "Calendar")}
      </div>
      <div className="border-line flex items-center justify-between border-t pt-2.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${needs ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
          {needs ? <><Icon name="AlertTriangle" size={11} />דורש טיפול {a.attention}</> : <><Icon name="ListChecks" size={11} />תקין</>}
        </span>
        <Link href="/team" className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold hover:underline">פתח סוכן<Icon name="ArrowLeft" size={12} /></Link>
      </div>
    </div>
  );
}

// ── E — Management Pulse sub-parts ────────────────────────────────────────────
function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-surface rounded-xl px-2.5 py-2 text-center">
      <div className={`text-lg font-black leading-none ${value > 0 ? TONE_TEXT[tone] : "text-muted"}`}>{value}</div>
      <div className="text-muted mt-1 text-[10px] font-semibold leading-tight">{label}</div>
    </div>
  );
}
function MiniDeal({ d }: { d: OfficeDealRow }) {
  return (
    <Link href={d.href} className="hover:bg-surface/70 -mx-1 flex items-center gap-2 rounded-lg px-1 py-1 transition">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.stuck ? "bg-danger" : "bg-brand"}`} />
      <span className="text-ink min-w-0 flex-1 truncate text-[12px] font-bold">{d.title}</span>
      <span className="text-ink shrink-0 text-[12px] font-black tabular-nums">{ils(d.value)}</span>
    </Link>
  );
}

// ── F — Management rail sub-parts ─────────────────────────────────────────────
function RailCard({ title, icon, href, hrefLabel, children }: { title: string; icon: string; href?: string; hrefLabel?: string; children: ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-[13px] font-black"><Icon name={icon} size={15} className="text-brand-strong" />{title}</p>
        {href && <Link href={href} className="text-brand-strong text-[11px] font-bold hover:underline">{hrefLabel ?? "הכל"}</Link>}
      </div>
      {children}
    </div>
  );
}

const QUICK_ACTIONS: { label: string; icon: string; href: string }[] = [
  { label: "לידים", icon: "UserPlus", href: "/leads" },
  { label: "נכסים", icon: "Building", href: "/properties" },
  { label: "עסקאות", icon: "Handshake", href: "/deals" },
  { label: "יומן", icon: "Calendar", href: "/calendar" },
  { label: "צוות", icon: "Users", href: "/team" },
  { label: "תובנות", icon: "Sparkles", href: "/office/intelligence" },
];

export function OfficeManagementCenter({ board }: { board: OfficeManagementBoard }) {
  const now = new Date();
  const dateHe = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(now);
  const s = board.summary;
  const agentCards = board.agents.filter((a) => a.role !== "owner"); // manager is the viewer, not a roster card
  const insight = board.intelligenceTeaser[0] ?? null;

  const quiet = (n: number) => (n === 0 ? "opacity-60" : "");
  const stat = (label: string, value: number, icon: string, href: string) => (
    <Link href={href} className={`${CARD} hover:border-brand-light flex items-center gap-3 p-3.5 transition ${quiet(value)}`}>
      <span className="bg-brand-soft text-brand-strong grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={icon} size={19} /></span>
      <div><div className="text-ink text-2xl font-black leading-none">{value}</div><div className="text-muted mt-0.5 text-[11px] font-semibold">{label}</div></div>
    </Link>
  );

  return (
    <div dir="rtl" className="flex flex-col gap-6 pb-10">
      {/* Shared operating-surface nav (היום שלי | המשרד | תובנות) */}
      <SurfaceTabs active="office" isManager />

      {/* ── A — Header ────────────────────────────────────────────────────────── */}
      <header>
        <p className="text-muted text-[13px] font-semibold">ניהול משרד</p>
        <h1 className="text-ink text-2xl font-black leading-tight">משרד {board.officeName}</h1>
        <p className="text-muted mt-0.5 text-[13px]">{greetingHe(now)} · {dateHe}</p>
      </header>

      {/* ── B — KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stat("סוכנים", s.agents, "Users", "/team")}
        {stat("נכסים פעילים", s.activeProperties, "Building", "/properties")}
        {stat("לידים פתוחים", s.activeLeads, "UserPlus", "/leads")}
        {stat("עסקאות פעילות", s.activeDeals, "Handshake", "/deals")}
        {stat("פגישות היום", s.meetingsToday, "Calendar", "/calendar")}
      </div>

      {/* ── MAIN + RAIL ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        {/* MAIN */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* C — My Agents (dominant) */}
          <section className="flex flex-col gap-3">
            <SectionHead title="הסוכנים שלי" sub="עומס ופעילות לפי סוכן" icon="Users" href="/team" hrefLabel="ניהול צוות" />
            {agentCards.length === 0 ? (
              <div className={`${CARD} text-muted p-6 text-center text-[13px]`}>עדיין אין סוכנים פעילים במשרד</div>
            ) : (
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-2 2xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
                {agentCards.map((a) => <AgentCard key={a.id} a={a} />)}
              </div>
            )}
          </section>

          {/* D — Office properties (carousel) */}
          <section className="flex flex-col gap-3">
            <SectionHead title="נכסי המשרד" sub={`${board.propertiesTotal} נכסים פעילים`} icon="Building" href="/properties" hrefLabel="כל נכסי המשרד" />
            <OfficePropertiesStrip cards={board.properties} />
          </section>

          {/* E — Management Pulse (leads / deals / attention) */}
          <section className="flex flex-col gap-3">
            <SectionHead title="דופק ניהולי" sub="לידים · עסקאות · דורש את תשומת לבך" icon="TrendingUp" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Leads */}
              <div className={`${CARD} flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between">
                  <p className="text-ink flex items-center gap-1.5 text-[13px] font-black"><Icon name="UserPlus" size={15} className="text-brand-strong" />לידים</p>
                  <Link href="/leads" className="text-brand-strong text-[11px] font-bold hover:underline">נהל</Link>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="ללא אחראי" value={board.leads.unassigned} tone="danger" />
                  <MiniStat label="חמים" value={board.leads.hot} tone="warning" />
                  <MiniStat label="בפיגור" value={board.leads.overdue} tone="danger" />
                  <MiniStat label="חדשים היום" value={board.leads.newToday} tone="success" />
                </div>
              </div>

              {/* Deals */}
              <div className={`${CARD} flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between">
                  <p className="text-ink flex items-center gap-1.5 text-[13px] font-black"><Icon name="Handshake" size={15} className="text-brand-strong" />עסקאות</p>
                  <Link href="/deals" className="text-brand-strong text-[11px] font-bold hover:underline">הכל</Link>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="פעילות" value={board.deals.active} tone="brand" />
                  <MiniStat label="תקועות" value={board.deals.stuck} tone="danger" />
                  <MiniStat label="שלב מתקדם" value={board.deals.lateStage} tone="success" />
                  <MiniStat label="נסגרו החודש" value={board.deals.wonPeriod} tone="success" />
                </div>
                {board.deals.rows.length > 0 && (
                  <div className="border-line flex flex-col gap-0.5 border-t pt-2">
                    {board.deals.rows.slice(0, 2).map((d) => <MiniDeal key={d.id} d={d} />)}
                  </div>
                )}
              </div>

              {/* Attention (demoted command center) */}
              <div className={`${CARD} flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between">
                  <p className="text-ink flex items-center gap-1.5 text-[13px] font-black"><Icon name="Flame" size={15} className="text-danger" />דורש את תשומת לבך</p>
                  <span className="text-muted text-[11px] font-bold">{board.center.summary.needsAttention}</span>
                </div>
                <OfficeAttentionCompact center={board.center} agents={board.reassignAgents} />
              </div>
            </div>
          </section>
        </div>

        {/* F — Management rail (sidebar on wide desktop; stacks below on smaller) */}
        <aside className="flex flex-col gap-4">
          <RailCard title="פעולות מהירות" icon="Sparkles">
            <div className="grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.map((q) => (
                <Link key={q.href} href={q.href} className="border-line hover:border-brand-light hover:bg-surface flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition">
                  <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-lg"><Icon name={q.icon} size={16} /></span>
                  <span className="text-ink text-[11px] font-bold">{q.label}</span>
                </Link>
              ))}
            </div>
          </RailCard>

          <RailCard title="פגישות המשרד היום" icon="Calendar" href="/calendar" hrefLabel="ליומן">
            {board.meetingsToday.length === 0 ? (
              <p className="text-muted py-2 text-center text-[12px]">אין פגישות מתוזמנות היום</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {board.meetingsToday.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <span className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-2 py-1 text-[12px] font-black tabular-nums">{m.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[12px] font-bold">{m.title}</p>
                      <p className="text-muted truncate text-[10px]">{m.kind}{m.agentName ? ` · ${m.agentName}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>

          {insight && (
            <div className="zono-ai-gradient flex flex-col gap-2 rounded-[22px] p-4 text-white">
              <p className="flex items-center gap-1.5 text-[12px] font-black opacity-90"><Icon name="Sparkles" size={14} />תובנה משרדית</p>
              <p className="text-[13px] font-medium leading-relaxed opacity-95">{insight.text}</p>
              <Link href="/office/intelligence" className="mt-0.5 text-[12px] font-bold underline opacity-90">לכל התובנות</Link>
            </div>
          )}

          {board.recentEvents.length > 0 && (
            <RailCard title="עדכונים אחרונים" icon="ListChecks">
              <ul className="flex flex-col gap-2.5">
                {board.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <span className="bg-surface text-muted mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"><Icon name={e.icon} size={13} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-[12px] font-semibold">{e.title}</p>
                      <p className="text-muted text-[10px]">{e.when}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </RailCard>
          )}
        </aside>
      </div>
    </div>
  );
}
