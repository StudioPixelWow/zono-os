"use client";

// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5 (Part 10) · THE ONE JOURNEY BLOCK.
//
// Every entity cockpit — Buyer / Seller / Lead / Property / Deal — renders THIS.
// Not five implementations of "a journey": one presentation of the ONE canonical
// model (CockpitJourney, 5.5A/5.5B), read from the spine by getCockpitJourney (5.5C).
//
// Entity-specific context (checklists, scores, matches, churn) EXTENDS this block by
// sitting next to it. It never forks it, and it never overrides the stage: intelligence
// is intelligence, lifecycle is the spine.
//
// What this component refuses to do:
//   · invent a stage        — no canonical journey ⇒ it says so, loudly.
//   · invent history        — no journey_events ⇒ an empty history, honestly labelled.
//   · render a dead control — a command absent from `allowedCommands` is not drawn.
// ============================================================================
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { requestEntityStageAction } from "@/lib/journey-cockpit/actions";
import type { CockpitJourney } from "@/lib/journey-cockpit/types";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("he-IL") : "—";

export function JourneyCockpitBlock({
  journey,
  /** False when the entity has no canonical stage-command event yet (seller today). */
  commandable = true,
  /** Entity-specific context rendered INSIDE the block, under the ladder. */
  children,
  compact = false,
}: {
  journey: CockpitJourney;
  commandable?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const stalled = journey.blockers.some((b) => b.kind === "stalled");
  const nextMilestone = journey.nextMilestone;
  const canAdvance =
    commandable && journey.allowedCommands.includes("advance") && !!nextMilestone;
  const canOverride = commandable && journey.allowedCommands.includes("override");

  const curIdx = journey.ladder.findIndex((s) => s.current);
  const prevRung = curIdx > 0 ? journey.ladder[curIdx - 1] : null;

  const go = (targetStage: string) => {
    setError(null);
    start(async () => {
      const r = await requestEntityStageAction(journey.entityType, journey.entityId, targetStage);
      if (!r.ok || r.error) setError(r.error ?? "עדכון שלב המסע נכשל");
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* FALLBACK — there is no canonical journey. We say so; we do not fake a stage. */}
      {journey.fallback && (
        <div className="bg-surface border-line text-muted flex items-start gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <p className="text-ink font-bold">אין מסע קנוני לישות הזו</p>
            <p className="text-xs">
              {journey.fallbackReason} — המסע ייווצר מהאירוע האמיתי הבא. אין כאן פעולות שלב.
            </p>
          </div>
        </div>
      )}

      {/* Stage + progress */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted text-xs font-semibold">שלב נוכחי</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl">
              <Icon name="Route" size={18} />
            </span>
            <h3 className="text-ink text-lg font-black">{journey.stageLabel || "—"}</h3>
            {journey.fallback && (
              <span
                className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold"
                title={journey.fallbackReason ?? undefined}
              >
                תאימות
              </span>
            )}
          </div>
          {nextMilestone && (
            <p className="text-muted mt-1 text-xs">השלב הבא: {nextMilestone.label}</p>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-end">
            <p className="text-brand-strong text-3xl font-black">{journey.progress}%</p>
            <p className="text-muted text-xs font-semibold">התקדמות במסע</p>
          </div>
          {journey.stageAgeDays !== null && (
            <div className="text-end">
              <p className={cn("text-3xl font-black", stalled ? "text-danger" : "text-ink")}>
                {journey.stageAgeDays}
              </p>
              <p className="text-muted text-xs font-semibold">ימים בשלב</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all"
          style={{ width: `${journey.progress}%` }}
        />
      </div>

      {/* BLOCKERS — observed facts, never guesses. */}
      {journey.blockers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {journey.blockers.map((b) => (
            <li
              key={b.kind}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold",
                b.kind === "stalled" ? "bg-danger-soft text-danger" : "bg-surface text-muted",
              )}
            >
              <Icon name="AlertTriangle" size={18} />
              {b.message}
            </li>
          ))}
        </ul>
      )}

      {/* The CANONICAL ladder — from the machine, not from a private list. */}
      {journey.ladder.length > 0 && (
        <div className="no-scrollbar -mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-[680px] items-center gap-1 px-1">
            {journey.ladder.map((s) => (
              <div key={s.key} className="flex flex-1 items-center gap-1">
                <span
                  className={cn(
                    "grid h-8 flex-1 place-items-center rounded-lg px-1 text-[10px] font-bold transition",
                    s.done && "bg-success-soft text-success",
                    s.current && (stalled ? "bg-danger text-white" : "bg-brand text-white"),
                    !s.done && !s.current && "bg-surface text-muted",
                  )}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMMANDS — 5.5G: only what is legal RIGHT NOW. Never a disabled placeholder. */}
      {(canAdvance || (canOverride && prevRung)) && (
        <div className="flex flex-wrap items-center gap-2">
          {canOverride && prevRung && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go(prevRung.key)}
              disabled={pending}
              leadingIcon={<Icon name="ChevronRight" size={15} />}
            >
              החזר ל{prevRung.label}
            </Button>
          )}
          {canAdvance && nextMilestone && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => go(nextMilestone.key)}
              disabled={pending}
              leadingIcon={<Icon name="ArrowUpRight" size={15} />}
            >
              קדם ל{nextMilestone.label}
            </Button>
          )}
          {journey.stageEnteredAt && (
            <span className="text-muted text-xs">בשלב זה מאז {fmtDate(journey.stageEnteredAt)}</span>
          )}
        </div>
      )}

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* Entity-specific context EXTENDS the block here. It never replaces the stage. */}
      {children}

      {/* REAL transition history — journey_events. Empty stays honestly empty. */}
      {!compact && (
        <div>
          <p className="text-ink mb-3 text-sm font-extrabold">היסטוריית שלבים</p>
          {journey.history.length === 0 ? (
            <p className="text-muted text-sm">
              {journey.fallback
                ? "אין היסטוריה — טרם נוצר מסע קנוני."
                : "אין עדיין מעברי שלב מתועדים."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {journey.history.slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-start gap-3">
                  <span className="bg-brand-soft text-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                    <Icon name="ArrowUpRight" size={15} />
                  </span>
                  <div>
                    <p className="text-ink text-sm font-semibold">
                      {h.fromLabel ? `${h.fromLabel} ← ${h.toLabel}` : `נפתח בשלב ${h.toLabel}`}
                    </p>
                    {h.reason && <p className="text-muted text-xs">{h.reason}</p>}
                    <p className="text-muted text-[11px]">
                      {fmtDate(h.occurredAt)}
                      {h.source ? ` · ${h.source}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
