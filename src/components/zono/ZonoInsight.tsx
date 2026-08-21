// ============================================================================
// ZONO — Insight card. PRESENTATIONAL ONLY: it renders an already-computed
// intelligence item in ZONO's voice. It never queries, scores, ranks, or invents
// copy. Matches the app's card grammar (bg-card/border-line/rounded-2xl); the
// text carries the meaning, the mascot is compact visual support (no giant
// speech bubbles). Render it only when a real backing item exists — no item,
// render nothing (the caller decides).
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoMark } from "./ZonoMark";
import { ZONO_VARIANT_META, type ZonoVariant, type ZonoSize } from "./states";

export interface ZonoAction { label: string; href: string }

export function ZonoInsight({
  variant, title, description, action, secondaryAction, source, confidence, markSize = "compact", className = "",
}: {
  variant: ZonoVariant;
  title: string;
  description?: string;
  action?: ZonoAction;
  secondaryAction?: ZonoAction;
  source?: string;
  confidence?: number;
  markSize?: ZonoSize;
  className?: string;
}) {
  const meta = ZONO_VARIANT_META[variant];
  return (
    <div className={`bg-card border-line flex items-start gap-3 rounded-2xl border p-3.5 ${className}`}>
      <ZonoMark size={markSize} state={meta.state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${meta.chip}`}>
            <Icon name={meta.icon} size={11} />{meta.label}
          </span>
          {typeof confidence === "number" && <span className="text-muted text-[11px] font-semibold">· ודאות {Math.round(confidence)}%</span>}
          {source && <span className="text-muted text-[11px]">· {source}</span>}
        </div>
        <p className="text-ink mt-1 text-[13.5px] font-bold leading-snug">{title}</p>
        {description && <p className="text-muted mt-0.5 text-[12px] leading-snug">{description}</p>}
        {(action || secondaryAction) && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {action && <Link href={action.href} className="text-brand-strong inline-flex items-center gap-0.5 text-[12.5px] font-bold hover:underline">{action.label}<Icon name="ArrowLeft" size={13} /></Link>}
            {secondaryAction && <Link href={secondaryAction.href} className="text-muted hover:text-ink inline-flex items-center gap-0.5 text-[12px] font-bold">{secondaryAction.label}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
