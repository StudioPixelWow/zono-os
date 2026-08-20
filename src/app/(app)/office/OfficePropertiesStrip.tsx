"use client";
// Office property strip — a real-estate-first horizontal CAROUSEL connected to the
// team: each card shows the responsible agent (photo + name) or an inline "שייך
// לסוכן" when unassigned. Manager filters prioritize operational exceptions (ללא
// סוכן / דורש טיפול / exclusivity) and can narrow by agent. Only filters backed by
// the current data render. Data is passed in from the server board (no fetching).
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { AssignMemberPopover } from "./AssignMemberPopover";
import type { OfficePropertyCard, OfficeAgentOption } from "@/lib/office/management-board";

type Filter = { kind: "all" } | { kind: "unassigned" } | { kind: "exclusive" } | { kind: "non_exclusive" } | { kind: "attention" } | { kind: "agent"; name: string };
const TXN_OVER: Record<string, string> = { brand: "bg-brand text-white", success: "bg-success text-white" };

function matches(p: OfficePropertyCard, f: Filter): boolean {
  switch (f.kind) {
    case "all": return true;
    case "unassigned": return !p.agentName;
    case "exclusive": return p.exclusive;
    case "non_exclusive": return !p.exclusive;
    case "attention": return p.interested === 0 || p.status === "draft";
    case "agent": return p.agentName === f.name;
  }
}

export function OfficePropertiesStrip({ cards, agents }: { cards: OfficePropertyCard[]; agents: OfficeAgentOption[] }) {
  const [f, setF] = useState<Filter>({ kind: "all" });
  const agentNames = useMemo(() => [...new Set(cards.map((c) => c.agentName).filter((x): x is string => !!x))], [cards]);
  const staticFilters = useMemo(() => {
    const defs: { f: Filter; label: string }[] = [
      { f: { kind: "all" }, label: "הכל" },
      { f: { kind: "unassigned" }, label: "ללא סוכן" },
      { f: { kind: "attention" }, label: "דורש טיפול" },
      { f: { kind: "exclusive" }, label: "בלעדיות" },
      { f: { kind: "non_exclusive" }, label: "ללא בלעדיות" },
    ];
    return defs.filter((d) => d.f.kind === "all" || cards.some((c) => matches(c, d.f)));
  }, [cards]);
  const active = (f2: Filter) => (f.kind === f2.kind && (f2.kind !== "agent" || (f.kind === "agent" && f.name === f2.name)));
  const shown = cards.filter((c) => matches(c, f));

  if (cards.length === 0) {
    return <div className="border-line text-muted rounded-2xl border border-dashed py-8 text-center text-[13px]">אין נכסים פעילים במשרד כרגע</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {staticFilters.map((x) => (
          <button key={x.label} type="button" onClick={() => setF(x.f)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${active(x.f) ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{x.label}</button>
        ))}
        {agentNames.length > 0 && <span className="text-muted/50 mx-0.5">·</span>}
        {agentNames.map((name) => (
          <button key={name} type="button" onClick={() => setF({ kind: "agent", name })}
            className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${active({ kind: "agent", name }) ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{name}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-muted py-6 text-center text-[13px]">אין נכסים בסינון הזה</div>
      ) : (
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((p) => {
            const txn = p.kind === "rent" ? { label: "השכרה", tone: "success" } : p.kind === "sale" ? { label: "מכירה", tone: "brand" } : null;
            return (
              <div key={p.id} className="border-line bg-card flex w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] sm:w-[290px]">
                <Link href={p.href} className="hover:opacity-95">
                  <div className="bg-surface relative h-40 w-full overflow-hidden">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- CDN/portal photos; next/image remote loader not configured for arbitrary hosts
                      <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="text-muted grid h-full w-full place-items-center"><Icon name="Building" size={34} /></div>
                    )}
                    {txn && <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm ${TXN_OVER[txn.tone]}`}>{txn.label}</span>}
                    {p.exclusive && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">בלעדיות</span>}
                    {p.price && p.price !== "—" && <span className="text-ink absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-black shadow-sm">{p.price}</span>}
                  </div>
                </Link>
                <div className="flex flex-col gap-1.5 p-3">
                  <Link href={p.href} className="min-w-0">
                    <p className="text-ink truncate text-[13px] font-black">{p.title}</p>
                    {p.sub && <p className="text-muted truncate text-[11px]">{p.sub}</p>}
                  </Link>
                  <div className="border-line flex items-center justify-between gap-2 border-t pt-1.5">
                    {p.agentName ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <AgentAvatar url={p.agentAvatarUrl} name={p.agentName} size={22} ring={false} />
                        <span className="text-muted min-w-0 truncate text-[11px]">{p.agentName}</span>
                      </span>
                    ) : (
                      <AssignMemberPopover entityType="property" entityId={p.id} agents={agents} size="xs" label="שייך לסוכן" />
                    )}
                    <span className="bg-surface text-muted shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold">{p.statusLabel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
