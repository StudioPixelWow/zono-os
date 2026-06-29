"use client";
// ============================================================================
// 🚀 Intelligence First-Run Experience™ — Phase 26.9. Presentation only.
// ----------------------------------------------------------------------------
// Turns an empty Intelligence module into a guided first run: a module intro,
// one clear primary CTA (link OR an existing server action — never a new
// engine), a "what happens after the scan" preview, and an honest progress
// view fed by EXISTING orchestrator/sync status (never faked). Light · RTL.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ScanStageStatus = "pending" | "running" | "completed" | "failed";
export interface ScanStage { label: string; status: ScanStageStatus }

function StageDot({ status }: { status: ScanStageStatus }) {
  if (status === "completed") return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-700">✓</span>;
  if (status === "running") return <span className="border-brand h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />;
  if (status === "failed") return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-100 text-[11px] font-black text-rose-700">✕</span>;
  return <span className="border-line grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] text-muted">○</span>;
}

/** Honest scan progress — render only with real stage statuses. */
export function IntelligenceProgress({ title = "סריקת מודיעין מתבצעת", subtitle, stages }: { title?: string; subtitle?: string; stages: ScanStage[] }) {
  const done = stages.filter((s) => s.status === "completed").length;
  return (
    <div dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-ink text-sm font-black">{title}</p>
          {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>
        <span className="text-muted text-xs font-bold tabular-nums">{done}/{stages.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <StageDot status={s.status} />
            <span className={cn("font-bold", s.status === "completed" ? "text-ink" : s.status === "running" ? "text-brand-strong" : s.status === "failed" ? "text-rose-600" : "text-muted")}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Alias kept for the spec's component vocabulary. */
export const IntelligenceScanStatus = IntelligenceProgress;

export interface FirstRunSecondary { label: string; href: string }

/**
 * Guided first-run. Primary CTA is EITHER a link (primaryHref) or an existing
 * server action (primaryAction) — this component never defines scan logic.
 */
export function IntelligenceFirstRun({
  emoji = "🚀", title, subtitle, whatNext, primaryLabel = "🚀 התחל סריקת מודיעין",
  primaryHref, primaryAction, runningLabel = "מפעיל…", secondary, stages,
}: {
  emoji?: string;
  title: string;
  subtitle: string;
  whatNext?: string[];
  primaryLabel?: string;
  primaryHref?: string;
  primaryAction?: () => Promise<{ error?: string; message?: string } | void>;
  runningLabel?: string;
  secondary?: FirstRunSecondary[];
  stages?: ScanStage[];
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const runPrimary = () => {
    if (!primaryAction || pending) return;
    setNote(null);
    start(async () => {
      const r = await primaryAction();
      if (r && "error" in r && r.error) setNote({ kind: "err", text: r.error });
      else setNote({ kind: "ok", text: r && "message" in r && r.message ? r.message : "הסריקה הופעלה. הנתונים יתעדכנו אוטומטית עם סיומה." });
    });
  };

  return (
    <div dir="rtl" className="border-line bg-card bg-gradient-to-bl from-brand-soft/40 rounded-2xl border to-transparent p-5 sm:p-6">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <span className="bg-brand-soft text-brand-strong mb-2.5 grid h-12 w-12 place-items-center rounded-2xl text-2xl">{emoji}</span>
        <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
        <p className="text-muted mt-1 max-w-xl text-sm">{subtitle}</p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryHref ? (
            <Link href={primaryHref} className="bg-brand hover:bg-brand-strong inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-black text-white transition">{primaryLabel}</Link>
          ) : primaryAction ? (
            <button type="button" onClick={runPrimary} disabled={pending} className="bg-brand hover:bg-brand-strong inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-black text-white transition disabled:opacity-50">
              {pending ? runningLabel : primaryLabel}
            </button>
          ) : null}
          {(secondary ?? []).map((s) => (
            <Link key={s.href + s.label} href={s.href} className="border-line bg-surface text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold transition">{s.label}</Link>
          ))}
        </div>

        {note && <p className={cn("mt-3 text-xs font-bold", note.kind === "err" ? "text-rose-600" : "text-emerald-600")}>{note.text}</p>}

        {whatNext && whatNext.length > 0 && (
          <div className="border-line/70 mt-6 w-full rounded-2xl border bg-surface/60 p-4 text-right">
            <p className="text-ink mb-2 text-xs font-black">מה יקרה אחרי הסריקה:</p>
            <ul className="flex flex-col gap-1.5">
              {whatNext.map((w) => (
                <li key={w} className="text-muted flex items-center gap-2 text-sm">
                  <span className="text-emerald-600">✓</span> <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stages && stages.length > 0 && <div className="mt-5 w-full"><IntelligenceProgress stages={stages} /></div>}
      </div>
    </div>
  );
}

/** Compact module intro (header + short explanation) for non-empty pages. */
export function IntelligenceModuleIntro({ emoji, title, subtitle }: { emoji?: string; title: string; subtitle: string }) {
  return (
    <div dir="rtl" className="flex items-start gap-3">
      {emoji && <span className="bg-brand-soft text-brand-strong grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl">{emoji}</span>}
      <div>
        <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
        <p className="text-muted mt-0.5 max-w-2xl text-sm">{subtitle}</p>
      </div>
    </div>
  );
}
