"use client";
// ============================================================================
// ZONO — Agent Manager Drawer (manager QUICK VIEW). A compact, premium, fully
// CLIENT-LOCAL side sheet: opening/closing never navigates or re-renders the
// /office server page. Identity + KPIs paint INSTANTLY from the clicked card;
// only the detail sections load lazily (cached per page session). Reads the
// canonical getOfficeAgentDetail selector (org-scoped, manager-gated). NOT a CRM
// page in a panel.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { ZonoInsight } from "@/components/zono/ZonoInsight";
import { pickAgentZonoRecommendation } from "@/lib/office/agent-zono";
import { AssignMemberPopover } from "./AssignMemberPopover";
import { loadOfficeAgentDetailAction } from "@/lib/office/agent-detail-actions";
import type { OfficeAgentDetail } from "@/lib/office/agent-detail";
import type { OfficeAgentCard, OfficeAgentOption } from "@/lib/office/management-board";

const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };
const ils = (n: number | null) => (n == null ? "—" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${n}`);

type Identity = { id: string; name: string; avatarUrl: string | null; specialty: string | null; role: string; hasLogin: boolean; accessLabel: string };
type Kpis = { activeProperties: number; openLeads: number; activeDeals: number; todayMeetings: number };

export function AgentManagerDrawer({ memberId, card, agents, cache, onClose }: {
  memberId: string | null; card: OfficeAgentCard | null; agents: OfficeAgentOption[];
  cache: Map<string, OfficeAgentDetail>; onClose: () => void;
}) {
  const open = !!memberId;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open || !memberId) return null;
  return (
    <div dir="rtl" className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="ניהול סוכן">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="bg-surface absolute inset-y-0 start-0 flex h-[100dvh] w-full max-w-[620px] flex-col shadow-2xl sm:w-[84vw] md:w-[600px]">
        <DrawerContent key={memberId} memberId={memberId} card={card} agents={agents} cache={cache} onClose={onClose} />
      </div>
    </div>
  );
}

function DrawerContent({ memberId, card, agents, cache, onClose }: {
  memberId: string; card: OfficeAgentCard | null; agents: OfficeAgentOption[];
  cache: Map<string, OfficeAgentDetail>; onClose: () => void;
}) {
  const cached = cache.get(memberId) ?? null;
  const [detail, setDetail] = useState<OfficeAgentDetail | null>(cached);
  const [state, setState] = useState<"loading" | "error" | "ready">(cached ? "ready" : "loading");
  const [reloadTick, setReloadTick] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    if (cached && reloadTick === 0) return () => clearTimeout(t);
    let alive = true;
    loadOfficeAgentDetailAction(memberId)
      .then((d) => { if (!alive) return; if (d) { cache.set(memberId, d); setDetail(d); setState("ready"); } else setState("error"); })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, reloadTick]);

  // Identity + KPIs paint immediately from the card; detail refines them.
  const identity: Identity | null = detail
    ? { id: detail.member.id, name: detail.member.name, avatarUrl: detail.member.avatarUrl, specialty: detail.member.specialty, role: detail.member.role, hasLogin: detail.member.hasLogin, accessLabel: detail.accessLabel }
    : card
      ? { id: card.id, name: card.name, avatarUrl: card.avatarUrl, specialty: card.specialty, role: card.role, hasLogin: card.hasLogin, accessLabel: card.hasLogin ? "פעיל · עם כניסה למערכת" : "פעיל · ללא כניסה למערכת" }
      : null;
  const kpis: Kpis | null = detail
    ? { activeProperties: detail.stats.activeProperties, openLeads: detail.stats.openLeads, activeDeals: detail.stats.activeDeals, todayMeetings: detail.stats.todayMeetings }
    : card
      ? { activeProperties: card.activeProperties, openLeads: card.openLeads, activeDeals: card.activeDeals, todayMeetings: card.todayMeetings }
      : null;

  return (
    <div className="flex h-full flex-col">
      {identity ? <Header id={identity} onClose={onClose} closeRef={closeRef} /> : <TopBar onClose={onClose} closeRef={closeRef} />}

      <div className="flex flex-1 flex-col overflow-y-auto">
        {kpis && <div className="px-4 pt-3.5"><KpiStrip k={kpis} /></div>}
        {state === "loading" && <SectionsSkeleton />}
        {state === "error" && (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <p className="text-ink text-[15px] font-bold">לא הצלחנו לטעון את פרטי הסוכן</p>
              <button type="button" onClick={() => { setState("loading"); setReloadTick((n) => n + 1); }} className="bg-brand-soft text-brand-strong mt-3 rounded-xl px-4 py-2 text-[13px] font-bold">נסה שוב</button>
            </div>
          </div>
        )}
        {state === "ready" && detail && <Sections data={detail} agents={agents} onClose={onClose} />}
      </div>

      <div className="border-line bg-surface flex items-center gap-2 border-t px-4 py-3">
        <Link href={`/office/agents/${memberId}`} onClick={onClose} className="bg-brand inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"><Icon name="ArrowLeft" size={14} />פתח עמוד סוכן</Link>
        <Link href="/calendar" onClick={onClose} className="border-line hover:bg-card text-ink inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition"><Icon name="Calendar" size={14} className="text-brand-strong" />יומן</Link>
      </div>
    </div>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────────
function TopBar({ onClose, closeRef }: { onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
      <span className="text-muted text-[12px] font-bold">ניהול סוכן</span>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
    </div>
  );
}

function Header({ id, onClose, closeRef }: { id: Identity; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="border-line bg-surface flex items-start gap-3 border-b px-4 py-3.5">
      <AgentAvatar url={id.avatarUrl} name={id.name} size={64} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-ink truncate text-[17px] font-black leading-tight">{id.name}</p>
        <p className="text-muted truncate text-[12.5px]">{id.specialty || ROLE_HE[id.role] || "מתווך/ת"}</p>
        <span className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold ${id.hasLogin ? "text-success" : "text-muted"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${id.hasLogin ? "bg-success" : "bg-muted"}`} />{id.accessLabel}
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
        <Link href={`/office/agents/${id.id}`} onClick={onClose} className="text-brand-strong text-[12px] font-bold hover:underline">עמוד מלא →</Link>
      </div>
    </div>
  );
}

function KpiStrip({ k }: { k: Kpis }) {
  const cell = (n: number, label: string) => (
    <div className="flex flex-col items-center justify-center rounded-xl py-2 text-center">
      <div className="text-ink text-xl font-black leading-none tabular-nums">{n}</div>
      <div className="text-muted mt-1 text-[11px] font-semibold">{label}</div>
    </div>
  );
  // One compact management strip (not four dashboard cards): a single bordered
  // surface, numbers dominant, labels secondary. 2×2 on mobile, one row on desktop.
  return <div className="bg-card border-line grid grid-cols-2 gap-1 rounded-2xl border p-1 sm:grid-cols-4">{cell(k.activeProperties, "נכסים")}{cell(k.openLeads, "לידים")}{cell(k.activeDeals, "עסקאות")}{cell(k.todayMeetings, "היום")}</div>;
}

// A section wrapper — a divider + generous top space gives clear hierarchy.
function Section({ title, count, action, first, children }: { title: string; count?: number; action?: React.ReactNode; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={first ? "" : "border-line mt-4 border-t pt-4"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-ink text-[13px] font-black">{title}{count != null && <span className="text-muted font-semibold"> · {count}</span>}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="text-muted py-1 text-[12px]">{text}</p>;
function MoreLink({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return <Link href={href} onClick={onClose} className="text-brand-strong text-[11.5px] font-bold hover:underline">{label}</Link>;
}

function Sections({ data, agents, onClose }: { data: OfficeAgentDetail; agents: OfficeAgentOption[]; onClose: () => void }) {
  const { member, stats } = data;
  const [showAllAttn, setShowAllAttn] = useState(false);
  const others = agents.filter((a) => a.id !== member.id);
  const needs = stats.overdueLeads + stats.stuckDeals + stats.overdueTasks;
  const breakdown = [
    stats.overdueLeads ? `${stats.overdueLeads} לידים` : null,
    stats.overdueTasks ? `${stats.overdueTasks} משימות` : null,
    stats.stuckDeals ? `${stats.stuckDeals} עסקאות` : null,
  ].filter(Boolean).join(" · ");
  const attn = showAllAttn ? data.needsAttention : data.needsAttention.slice(0, 3);
  const agentPage = `/office/agents/${member.id}`;

  // MAX ONE ZONO recommendation — the single most important real, actionable item
  // from the canonical agent-detail stats (never fabricated; hidden when none).
  const topRec = pickAgentZonoRecommendation(stats);

  return (
    <div className="px-4 pb-4 pt-1">
      {topRec && (
        <div className="mb-3">
          <ZonoInsight variant="recommendation" markSize="micro" title={topRec.title} action={{ label: topRec.label, href: agentPage }} />
        </div>
      )}
      {/* Today */}
      <Section title="היום" count={data.meetingsToday.length || undefined} first>
        {data.meetingsToday.length === 0 ? <Empty text="אין פגישות נוספות להיום" /> : (
          <ul className="flex flex-col gap-1">
            {data.meetingsToday.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 py-1">
                <span className="bg-brand-soft text-brand-strong shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-black tabular-nums">{m.time}</span>
                <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-bold">{m.title}</span>
                <span className="text-muted shrink-0 text-[11px]">{m.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Attention — calm; amber, not an error report */}
      <Section title="דורש תשומת לב" action={needs > 0 ? <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[11.5px] font-black">{needs} פריטים</span> : <span className="text-success text-[11.5px] font-bold">הכול תקין ✓</span>}>
        {needs > 0 && breakdown && <p className="text-muted -mt-1 mb-1.5 text-[11.5px]">{breakdown}</p>}
        {data.needsAttention.length === 0 ? <Empty text="הכול מסודר כרגע" /> : (
          <ul className="flex flex-col gap-0.5">
            {attn.map((n) => (
              <li key={n.id}>
                <Link href={n.href} onClick={onClose} className="hover:bg-card flex items-start gap-2 rounded-lg px-1.5 py-1.5 transition">
                  <span className="bg-warning mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[12.5px] font-bold">{n.label}</span><span className="text-muted block truncate text-[11px]">{n.sub}</span></span>
                  <span className="text-brand-strong shrink-0 self-center text-[11px] font-bold">פתח →</span>
                </Link>
              </li>
            ))}
            {data.needsAttention.length > 3 && (
              <li><button type="button" onClick={() => setShowAllAttn((v) => !v)} className="text-brand-strong px-1.5 py-1 text-[11.5px] font-bold hover:underline">{showAllAttn ? "הצג פחות" : `הצג עוד ${data.needsAttention.length - 3}`}</button></li>
            )}
          </ul>
        )}
      </Section>

      {/* Portfolio — real-estate first (thumbnails) */}
      <Section title="נכסי הסוכן" count={stats.activeProperties || undefined} action={stats.activeProperties > 0 ? <MoreLink href={agentPage} label={`כל הנכסים (${stats.activeProperties}) →`} onClose={onClose} /> : undefined}>
        {data.properties.length === 0 ? <Empty text="אין נכסים משויכים לסוכן" /> : (
          <ul className="flex flex-col gap-2">
            {data.properties.slice(0, 3).map((p) => (
              <li key={p.id}>
                <Link href={p.href} onClick={onClose} className="border-line hover:bg-card flex items-stretch gap-2.5 overflow-hidden rounded-xl border transition">
                  <span className="bg-card relative aspect-square w-[76px] shrink-0 overflow-hidden">
                    {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={22} /></span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pe-2.5">
                    <span className="text-ink line-clamp-1 text-[13px] font-bold">{p.title}</span>
                    <span className="text-muted line-clamp-1 text-[11px]">{p.sub}</span>
                    <span className="flex items-center gap-2"><span className="text-ink text-[12.5px] font-black">{p.price}</span><span className="text-muted text-[10.5px]">{p.statusLabel}</span></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Leads */}
      <Section title="לידים" count={stats.openLeads || undefined} action={stats.openLeads > 3 ? <MoreLink href={agentPage} label={`כל הלידים (${stats.openLeads}) →`} onClose={onClose} /> : undefined}>
        {data.leads.length === 0 ? <Empty text="אין לידים פתוחים" /> : (
          <ul className="flex flex-col gap-1">
            {data.leads.slice(0, 3).map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-0.5">
                <Link href={`/leads/${l.id}`} onClick={onClose} className="min-w-0 flex-1"><span className="text-ink block truncate text-[13px] font-bold">{l.name}</span><span className="text-muted block truncate text-[11px]">{l.stage}</span></Link>
                {l.hot && <span className="bg-warning-soft text-warning shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black">חם</span>}
                {others.length > 0 && <AssignMemberPopover entityType="lead" entityId={l.id} agents={others} size="xs" label="העבר" />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Deals — red reserved for a truly stuck deal */}
      <Section title="עסקאות" count={stats.activeDeals || undefined} action={stats.activeDeals > 3 ? <MoreLink href={agentPage} label="כל העסקאות →" onClose={onClose} /> : undefined}>
        {data.deals.length === 0 ? <Empty text="אין עסקאות פעילות" /> : (
          <ul className="flex flex-col gap-1">
            {data.deals.slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link href={d.href} onClick={onClose} className="hover:bg-card flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 transition">
                  <span className="min-w-0"><span className="text-ink block truncate text-[13px] font-bold">{d.title}</span><span className="text-muted block truncate text-[11px]">{d.stage}{d.ageDays != null ? ` · ${d.ageDays} ימים` : ""}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5">{d.stuck && <span className="bg-danger-soft text-danger rounded-full px-1.5 py-0.5 text-[10px] font-black">תקועה</span>}<span className="text-ink text-[12.5px] font-black">{ils(d.value)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Recent activity */}
      {data.recentActivity.length > 0 && (
        <Section title="פעילות אחרונה">
          <ul className="flex flex-col gap-1.5 ps-1">
            {data.recentActivity.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className="bg-brand-light mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1"><span className="text-ink block truncate text-[12px]">{a.label}</span><span className="text-muted text-[10.5px]">{a.when}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-4">
      <div className="bg-black/[0.05] h-4 w-24 animate-pulse rounded" />
      {[0, 1, 2].map((i) => <div key={i} className="bg-black/[0.05] h-14 animate-pulse rounded-xl" />)}
    </div>
  );
}
