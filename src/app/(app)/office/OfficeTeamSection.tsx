"use client";
// ============================================================================
// ZONO — Office team section (client island). Renders the dominant "הצוות שלי"
// agent cards and opens the in-context Agent Manager Drawer on click — a purely
// CLIENT-LOCAL overlay: no router navigation, no ?agent URL sync, so opening or
// closing NEVER re-renders the force-dynamic /office server page (which would
// otherwise re-run getOfficeManagementBoard and flash the whole dashboard).
// Detailed drawer data is lazy-loaded per agent and cached for the page session.
// ============================================================================
import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AgentManagerDrawer } from "./AgentManagerDrawer";
import type { OfficeAgentDetail } from "@/lib/office/agent-detail";
import type { OfficeAgentCard, OfficeAgentOption } from "@/lib/office/management-board";

const ROLE_HE: Record<string, string> = { owner: "מנהל/ת משרד", manager: "מנהל/ת", agent: "מתווך/ת" };

function AgentCard({ a, onOpen }: { a: OfficeAgentCard; onOpen: (id: string, el: HTMLElement) => void }) {
  const needs = a.attention > 0;
  const metric = (label: string, value: number, icon: string) => (
    <div className="flex items-center gap-1.5"><Icon name={icon} size={13} className="text-muted" /><span className="text-ink text-[13px] font-black tabular-nums">{value}</span><span className="text-muted text-[11px]">{label}</span></div>
  );
  return (
    <div
      role="button" tabIndex={0}
      onClick={(e) => onOpen(a.id, e.currentTarget)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(a.id, e.currentTarget); } }}
      aria-label={`הצג את ${a.name}`}
      className="bg-card border-line focus-visible:ring-brand focus:outline-none focus-visible:ring-2 hover:border-brand-light flex w-[80%] shrink-0 cursor-pointer snap-start flex-col gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-card)] transition sm:w-auto"
    >
      <div className="flex items-center gap-3">
        <AgentAvatar url={a.avatarUrl} name={a.name} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-black">{a.name}</p>
          <p className="text-muted truncate text-[12px]">{a.specialty || ROLE_HE[a.role] || "מתווך/ת"}</p>
          {!a.hasLogin && <p className="text-muted/80 text-[10px]">ללא כניסה למערכת</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {metric("נכסים", a.activeProperties, "Building")}
        {metric("לידים", a.openLeads, "Users")}
        {metric("עסקאות", a.activeDeals, "Handshake")}
        {metric("פגישות היום", a.todayMeetings, "Calendar")}
      </div>
      <div className="border-line flex items-center justify-between border-t pt-2.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${needs ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
          {needs ? <><Icon name="AlertTriangle" size={11} />דורש טיפול {a.attention}</> : <><Icon name="ListChecks" size={11} />הכול תקין</>}
        </span>
        <span className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold">הצג סוכן<Icon name="ArrowLeft" size={12} /></span>
      </div>
    </div>
  );
}

export function OfficeTeamSection({ agents, agentOptions }: { agents: OfficeAgentCard[]; agentOptions: OfficeAgentOption[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Per-page-session detail cache so reopening an agent is instant (no refetch).
  const cacheRef = useRef<Map<string, OfficeAgentDetail>>(new Map());

  const open = useCallback((id: string, el: HTMLElement) => { triggerRef.current = el; setOpenId(id); }, []);
  const close = useCallback(() => {
    setOpenId(null);
    const el = triggerRef.current; triggerRef.current = null;
    if (el) setTimeout(() => el.focus(), 0);
  }, []);

  if (agents.length === 0) {
    return <div className="bg-card border-line text-muted rounded-[22px] border p-6 text-center text-[13px] shadow-[var(--shadow-card)]">עדיין אין סוכנים פעילים במשרד</div>;
  }

  const openCard = openId ? agents.find((a) => a.id === openId) ?? null : null;

  return (
    <>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 2xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {agents.map((a) => <AgentCard key={a.id} a={a} onOpen={open} />)}
      </div>
      <AgentManagerDrawer memberId={openId} card={openCard} agents={agentOptions} cache={cacheRef.current} onClose={close} />
    </>
  );
}
