"use client";
// ============================================================================
// 🔁 ZONO — StartWorkflowButton (global workflow action). 30.4.2. Part 1.
// A reusable control that lets ANY surface (workspace card, agent inbox item,
// Ask ZONO proposal, mission, scorecard) turn an entity/insight into a persistent
// workflow. Preselects the best template, prevents duplicates, shows the active-
// workflow badge, and renders inline success (no full-page navigation). Reuses
// the Persistent Workflow Execution from 30.4.1. Nothing auto-executes.
// Value imports come from pure /types + /mapping submodules only.
// ============================================================================
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { startWorkflowAction, getEntityWorkflowsAction, listWorkflowTemplatesAction } from "@/lib/brokerage-data/actions";
import type { EntityKind, Workflow } from "@/lib/workflow-builder/types";
import { suggestTemplate } from "@/lib/workflow-builder/mapping";

interface TemplateSummary { id: string; name: string; entityKind: EntityKind }
interface EntityWorkflow { id: string; templateId: string; name: string; status: string; percent: number }

export interface StartWorkflowButtonProps {
  entityType: EntityKind; entityId: string; entityName: string;
  suggestedTemplate?: string | null; hints?: string[];
  sourceType?: string; sourceId?: string; sourceTitle?: string;
  compact?: boolean; showBadge?: boolean; label?: string;
}

export default function StartWorkflowButton({ entityType, entityId, entityName, suggestedTemplate, hints = [], sourceTitle, compact, showBadge = true, label }: StartWorkflowButtonProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [tplId, setTplId] = useState<string>(suggestedTemplate || suggestTemplate(entityType, hints) || "");
  const [active, setActive] = useState<EntityWorkflow[]>([]);
  const [started, setStarted] = useState<Workflow | null>(null);
  const [dup, setDup] = useState<EntityWorkflow | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadActive = useCallback(async () => {
    if (!entityId) return;
    const r = await getEntityWorkflowsAction(entityType, entityId);
    if (r.ok) setActive(r.result ?? []);
  }, [entityType, entityId]);

  // Badge fetch — the setState happens after an await, so it is not a synchronous
  // setState inside the effect body.
  useEffect(() => {
    if (!showBadge || !entityId) return;
    let alive = true;
    (async () => { const r = await getEntityWorkflowsAction(entityType, entityId); if (alive && r.ok) setActive(r.result ?? []); })();
    return () => { alive = false; };
  }, [showBadge, entityType, entityId]);

  const openPicker = async () => {
    setOpen((v) => !v); setErr(null); setDup(null);
    if (!templates.length) { const t = await listWorkflowTemplatesAction(); if (t.ok && t.result) setTemplates(t.result); }
    if (!tplId) setTplId(suggestedTemplate || suggestTemplate(entityType, hints) || "");
    if (!active.length) loadActive();
  };

  const start = async () => {
    if (!tplId) { setErr("בחר תבנית."); return; }
    setPending(true); setErr(null); setDup(null);
    try {
      const r = await startWorkflowAction(tplId, { entityKind: entityType, entityId, entityName });
      if (r.ok && r.result) { setStarted(r.result); setOpen(false); loadActive(); }
      else if (r.duplicate) setDup(r.duplicate as EntityWorkflow);
      else setErr(r.error ?? "נכשל");
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה"); } finally { setPending(false); }
  };

  const activeStepTitle = started ? (started.steps.find((s) => s.id === started.progress.currentStepId)?.title ?? null) : null;

  // Inline success state.
  if (started) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-[10px]">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">✅ Workflow הופעל</span>
        {activeStepTitle && <span className="text-muted">· שלב: {activeStepTitle} ({started.progress.percent}%)</span>}
        <Link href="/workflow-builder" className="rounded-full border border-sky-300 px-2 py-0.5 font-bold text-sky-700">פתח</Link>
      </span>
    );
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1">
      {showBadge && active.length > 0 && (
        <Link href="/workflow-builder" className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800" title={active.map((a) => a.name).join(", ")}>🔁 Workflow פעיל</Link>
      )}
      <button onClick={openPicker} className={cn("rounded-lg border border-sky-400 font-bold text-sky-800", compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]")}>{label ?? "התחל Workflow"}</button>

      {open && (
        <span className="absolute top-full right-0 z-30 mt-1 flex w-64 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl">
          {sourceTitle && <span className="text-muted text-[10px]">מקור: {sourceTitle}</span>}
          <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px]">
            {!templates.length && <option value={tplId}>{tplId || "טוען תבניות…"}</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={start} disabled={pending} className="flex-1 rounded-lg bg-sky-700 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-60">{pending ? "מפעיל…" : "הפעל"}</button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-2 py-1 text-[11px]">בטל</button>
          </div>
          {dup && <span className="text-[10px] text-amber-700">כבר קיים Workflow פעיל מאותה תבנית — <Link href="/workflow-builder" className="font-bold underline">פתח</Link></span>}
          {err && <span className="text-[10px] font-semibold text-rose-700">{err}</span>}
        </span>
      )}
    </span>
  );
}
