"use client";
// ============================================================================
// ZONO — Office team section (client island). Renders the dominant "הצוות שלי"
// agent cards and opens the in-context Agent Manager Drawer on click — the
// manager inspects an agent WITHOUT leaving /office (no navigation to /team).
// Supports a ?agent=<id> deep link (reopen/back) and restores focus to the
// triggering card on close. Detailed drawer data is lazy-loaded per agent.
// ============================================================================
import { useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AgentManagerDrawer } from "./AgentManagerDrawer";
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
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${needs ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
          {needs ? <><Icon name="AlertTriangle" size={11} />דורש טיפול {a.attention}</> : <><Icon name="ListChecks" size={11} />הכול תקין</>}
        </span>
        <span className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold">הצג סוכן<Icon name="ArrowLeft" size={12} /></span>
      </div>
    </div>
  );
}

export function OfficeTeamSection({ agents, agentOptions }: { agents: OfficeAgentCard[]; agentOptions: OfficeAgentOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const triggerRef = useRef<HTMLElement | null>(null);

  // LOCAL state is the source of truth so a click opens the drawer INSTANTLY,
  // independent of any server round-trip (the /office server page is force-dynamic
  // and does not read searchParams, so a query-only navigation does not reliably
  // re-render this island). The URL is kept in sync best-effort for deep links /
  // refresh; the initializer honours an incoming ?agent=<id>. Only a VALID in-list
  // agent may open (a foreign/unknown id never does).
  const [openId, setOpenId] = useState<string | null>(() => {
    const q = searchParams.get("agent");
    return q && agents.some((a) => a.id === q) ? q : null;
  });

  const open = useCallback((id: string, el: HTMLElement) => {
    triggerRef.current = el;
    setOpenId(id);
    router.replace(`/office?agent=${id}`, { scroll: false });
  }, [router]);

  const close = useCallback(() => {
    setOpenId(null);
    router.replace("/office", { scroll: false });
    const el = triggerRef.current; triggerRef.current = null;
    if (el) setTimeout(() => el.focus(), 0);
  }, [router]);

  if (agents.length === 0) {
    return <div className="bg-card border-line text-muted rounded-[22px] border p-6 text-center text-[13px] shadow-[var(--shadow-card)]">עדיין אין סוכנים פעילים במשרד</div>;
  }

  return (
    <>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 2xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {agents.map((a) => <AgentCard key={a.id} a={a} onOpen={open} />)}
      </div>
      <AgentManagerDrawer memberId={openId} agents={agentOptions} onClose={close} />
    </>
  );
}
