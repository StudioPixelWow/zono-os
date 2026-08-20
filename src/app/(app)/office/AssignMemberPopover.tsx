"use client";
// ZONO — Inline "שייך לסוכן" popover. Lets the manager assign a lead/property to
// a roster agent WITH workload context (photo · open leads · overdue), then
// refreshes. Assignment writes office attribution via the canonical roster
// actions; the manager decides (no opaque recommendation).
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { assignLeadToOfficeMemberAction, assignPropertyToOfficeMemberAction } from "@/lib/office/roster-actions";
import type { OfficeAgentOption } from "@/lib/office/management-board";

export function AssignMemberPopover({ entityType, entityId, agents, label = "שייך לסוכן", size = "sm" }: {
  entityType: "lead" | "property"; entityId: string; agents: OfficeAgentOption[]; label?: string; size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!agents.length) return null;

  const assign = (memberId: string) => start(async () => {
    setError(null);
    const r = entityType === "lead"
      ? await assignLeadToOfficeMemberAction(entityId, memberId)
      : await assignPropertyToOfficeMemberAction(entityId, memberId);
    if (r.ok) { setOpen(false); router.refresh(); }
    else setError(r.error ?? "השיוך נכשל.");
  });

  const btnCls = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";
  return (
    <div className="relative" ref={ref} dir="rtl">
      <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)}
        className={`bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-lg font-bold transition hover:brightness-95 disabled:opacity-60 ${btnCls}`}>
        <Icon name="UserPlus" size={13} />{busy ? "משייך…" : label}
      </button>
      {open && (
        <div className="border-line bg-card absolute end-0 z-30 mt-1 w-60 rounded-2xl border p-1.5 shadow-[var(--shadow-lift)]">
          <p className="text-muted px-2 py-1 text-[11px] font-bold">בחר סוכן</p>
          {agents.map((a) => (
            <button key={a.id} type="button" disabled={busy} onClick={() => assign(a.id)}
              className="hover:bg-surface flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-right transition disabled:opacity-60">
              <AgentAvatar url={a.avatarUrl} name={a.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-[13px] font-bold">{a.name}</span>
                <span className="text-muted block truncate text-[11px]">{a.openLeads} לידים{a.overdue > 0 ? ` · ${a.overdue} באיחור` : ""}{!a.hasLogin ? " · ללא כניסה" : ""}</span>
              </span>
            </button>
          ))}
          {error && <p className="text-danger px-2 pb-1 pt-0.5 text-[11px]">{error}</p>}
        </div>
      )}
    </div>
  );
}
