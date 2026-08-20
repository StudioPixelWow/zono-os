"use client";
// ============================================================================
// ZONO — Office attention, COMPACT. The old full-page OfficeCommandCenter is
// demoted here into a calm, 3rd Management-Pulse card: the top office exceptions
// (P0 then P1) as ≤4 summarized rows with one CTA each and inline lead
// reassignment; "הצג עוד" expands to the full critical queue. Default compact —
// this is a pulse, not the whole command center. Consumes the SAME real
// ManagerCommandCenter data (no new logic). RTL.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { reassignLeadAction } from "@/lib/office/manager-actions";
import type { ManagerCommandCenter, ManagerException } from "@/lib/office/manager-core";

const PRI_DOT: Record<string, string> = { P0: "bg-danger", P1: "bg-warning", P2: "bg-muted/50" };
const COMPACT = 4;

function Row({ e, agents, onReassigned }: { e: ManagerException; agents: { id: string; name: string }[]; onReassigned: () => void }) {
  const [busy, start] = useTransition();
  const canReassign = e.entityType === "lead" && !!e.entityId && agents.length > 0;
  return (
    <div className="border-line hover:bg-surface/60 flex items-center gap-2.5 rounded-xl border px-3 py-2 transition">
      <span className={`h-2 w-2 shrink-0 rounded-full ${PRI_DOT[e.priority]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[13px] font-bold">{e.title}</p>
        <p className="text-muted truncate text-[11px]">
          {e.agingLabel && <span className="text-warning font-bold">{e.agingLabel} · </span>}
          {e.subtitle}{e.agentName ? ` · ${e.agentName}` : e.entityType === "lead" ? " · ללא אחראי" : ""}
        </p>
      </div>
      {canReassign && (
        <select
          defaultValue=""
          disabled={busy}
          aria-label="העבר לסוכן"
          onChange={(ev) => { const v = ev.target.value; if (!v) return; start(async () => { await reassignLeadAction(e.entityId!, v); onReassigned(); }); }}
          className="border-line bg-surface text-ink hidden shrink-0 rounded-lg border px-1.5 py-1 text-[11px] sm:block"
        >
          <option value="">שייך…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <Link href={e.route} className="text-brand-strong inline-flex shrink-0 items-center gap-0.5 text-[12px] font-bold hover:underline">
        {e.cta}<Icon name="ArrowLeft" size={12} />
      </Link>
    </div>
  );
}

export function OfficeAttentionCompact({ center, agents }: { center: ManagerCommandCenter; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const refresh = () => startRefresh(() => router.refresh());

  const queue = [...center.critical, ...center.attention];
  if (queue.length === 0) {
    return (
      <div className="bg-success-soft flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl p-5 text-center">
        <span className="text-success text-2xl leading-none">✓</span>
        <p className="text-ink text-[13px] font-black">המשרד בשליטה</p>
        <p className="text-muted text-[11px]">אין חריגים שדורשים אותך כרגע</p>
      </div>
    );
  }

  const shown = expanded ? queue.slice(0, 12) : queue.slice(0, COMPACT);
  const remaining = Math.min(queue.length, 12) - COMPACT;

  return (
    <div className="flex flex-col gap-2">
      {shown.map((e) => <Row key={e.id} e={e} agents={agents} onReassigned={refresh} />)}
      {!expanded && remaining > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="text-brand-strong self-center py-0.5 text-[12px] font-bold hover:underline">
          הצג עוד ({remaining})
        </button>
      )}
      {queue.length > 12 && expanded && (
        <Link href="/action-center" className="text-brand-strong self-center py-0.5 text-[12px] font-bold hover:underline">
          לכל החריגים ({queue.length}) ←
        </Link>
      )}
    </div>
  );
}
