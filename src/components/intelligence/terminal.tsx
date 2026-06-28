// ============================================================================
// ZONO — Intelligence Terminal primitives (presentation only · RTL · client-safe).
// ----------------------------------------------------------------------------
// A premium, minimal "financial terminal" visual language for the Broker /
// Office / Neighborhood intelligence profiles: white surface, dark typography,
// a single purple accent, generous spacing. These are DUMB presentational
// components — they render values that already exist; they never compute.
// Every metric can carry a 🧠 Why? via the existing WhyButton.
// ============================================================================
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WhyButton } from "@/components/explainability/WhyButton";
import type { ScoreReason } from "@/lib/explainability/types";

/** A real value or — when absent — a disclosed em-dash (never a fake 0). */
export function val(v: number | null | undefined, suffix = ""): string {
  return v == null || Number.isNaN(v) ? "—" : `${Math.round(v)}${suffix}`;
}
export function pct01(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : `${Math.round(v * 100)}%`;
}

export function TerminalSection({ title, subtitle, why, whySource, children, action }: {
  title: string; subtitle?: string; why?: ScoreReason[] | string[]; whySource?: string; children: ReactNode; action?: ReactNode;
}) {
  return (
    <section dir="rtl" className="border-line bg-card rounded-2xl border p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-ink text-base font-black tracking-tight sm:text-lg">{title}</h2>
            {why && why.length > 0 && <WhyButton reasons={why} source={whySource} />}
          </div>
          {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A single terminal metric tile. */
export function Metric({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="border-line bg-surface rounded-xl border p-3">
      <div className={cn("text-xl font-black tabular-nums sm:text-2xl", accent ? "text-brand-strong" : "text-ink")}>{value}</div>
      <div className="text-muted mt-1 text-[11px] font-bold leading-tight">{label}</div>
      {hint && <div className="text-muted/80 mt-0.5 text-[10px]">{hint}</div>}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

/** A 0..100 bar with a label + right-aligned value. */
export function BarMeter({ label, value, max = 100 }: { label: string; value: number | null; max?: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="text-muted mb-1 flex items-center justify-between text-xs font-bold">
        <span>{label}</span><span className={cn("tabular-nums", value == null ? "text-muted" : "text-ink")}>{val(value)}</span>
      </div>
      <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full">
        <div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export type StatusTone = "leader" | "runner" | "contender" | "rising" | "neutral" | "warn";
const STATUS_CLS: Record<StatusTone, string> = {
  leader: "bg-brand-soft text-brand-strong",
  runner: "bg-sky-50 text-sky-700",
  contender: "bg-amber-50 text-amber-700",
  rising: "bg-emerald-50 text-emerald-700",
  neutral: "bg-surface text-muted",
  warn: "bg-rose-50 text-rose-700",
};
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black", STATUS_CLS[tone])}>{label}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold", STATUS_CLS[tone])}>{children}</span>;
}

export function TerminalEmpty({ text }: { text: string }) {
  return <div className="border-line text-muted rounded-xl border border-dashed p-5 text-center text-xs">{text}</div>;
}

/** Disclosed source line (data confidence + last calculated + what's missing). */
export function SourceLine({ confidence, lastCalculated, missing }: { confidence?: number | null; lastCalculated?: string | null; missing?: string[] }) {
  const parts: string[] = [];
  if (confidence != null) parts.push(`ביטחון נתונים ${Math.round(confidence)}%`);
  if (lastCalculated) parts.push(`עודכן ${new Date(lastCalculated).toLocaleDateString("he-IL")}`);
  if (missing && missing.length) parts.push(`חסר: ${missing.slice(0, 3).join(", ")}`);
  if (!parts.length) return null;
  return <p className="text-muted/80 mt-3 text-[10px]">{parts.join(" · ")}</p>;
}
