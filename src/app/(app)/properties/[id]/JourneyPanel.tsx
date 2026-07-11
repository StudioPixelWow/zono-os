"use client";

// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5E · THE PROPERTY COCKPIT, ON THE SPINE.
//
// BEFORE: this panel read `property_journeys.current_stage` and wrote it back
// through setJourneyStageAction — a lifecycle the canonical spine never saw.
// AFTER : it renders the canonical CockpitJourney (5.5B/5.5C) and its buttons emit
// `property.stage_changed`, which the kernel applies to `journeys` + `journey_events`.
//
// Both halves moved together on purpose. Flipping only the write would have left the
// broker clicking "advance" and watching the old stage stare back.
//
// The stage checklist below is still keyed off the legacy vocabulary — deliberately.
// A checklist is about ASSET COMPLETENESS (has a price, has photos, has a description),
// not about lifecycle position, and re-authoring it is a later batch's job, not a reason
// to hold up retiring the second writer. The map that bridges them is explicit and narrow.
// ============================================================================
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { requestPropertyStageAction } from "@/lib/journey-cockpit/actions";
import type { CockpitJourney } from "@/lib/journey-cockpit/types";
import {
  STAGE_DEFS,
  healthScore,
  healthTone,
  missingActions,
  nextRecommendedAction,
  requiredActions,
  type JourneyContext,
} from "@/lib/journey/stages";
import type { Database, JourneyStage } from "@/lib/supabase/types";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];

/**
 * Canonical stage → the legacy stage whose CHECKLIST applies. Lifecycle truth comes
 * from the canonical journey; this map only decides which asset checklist to show.
 */
const CHECKLIST_STAGE: Record<string, JourneyStage> = {
  draft: "new",
  preparation: "information_collection",
  ready_to_publish: "marketing_preparation",
  active: "published",
  marketing: "active_marketing",
  viewings: "active_marketing",
  offers: "negotiation",
  negotiation: "negotiation",
  under_contract: "deal_signed",
  sold: "closed",
  rented: "closed",
  paused: "active_marketing",
  archived: "closed",
};
const checklistStage = (canonical: string): JourneyStage =>
  CHECKLIST_STAGE[canonical] ?? "new";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("he-IL") : "—";

export function JourneyPanel({
  propertyId,
  journey,
  context,
  activities,
}: {
  propertyId: string;
  journey: CockpitJourney;
  context: JourneyContext;
  activities: ActivityRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const legacyForChecklist = checklistStage(journey.currentStage);
  const allActions = requiredActions(legacyForChecklist, context);
  const missing = missingActions(legacyForChecklist, context);
  const completed = allActions.filter((a) => a.done);
  const recommended = nextRecommendedAction(legacyForChecklist, context);
  const health = healthScore(legacyForChecklist, context, journey.lastActivityAt);
  const hTone = healthTone(health);
  const healthColor =
    hTone === "good" ? "text-success" : hTone === "medium" ? "text-brand-strong" : "text-danger";

  const stalled = journey.blockers.some((b) => b.kind === "stalled");
  const nextMilestone = journey.nextMilestone;
  const canAdvance = journey.allowedCommands.includes("advance") && !!nextMilestone;
  const canOverride = journey.allowedCommands.includes("override");

  // The rung BEHIND the current one — the only legal "override" target we offer.
  const curIdx = journey.ladder.findIndex((s) => s.current);
  const prevRung = curIdx > 0 ? journey.ladder[curIdx - 1] : null;

  const go = (targetStage: string) => {
    setError(null);
    start(async () => {
      const r = await requestPropertyStageAction(propertyId, targetStage);
      if (!r.ok || r.error) setError(r.error ?? "עדכון שלב המסע נכשל");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* FALLBACK — no canonical journey. We say so; we do not fake a stage. */}
      {journey.fallback && (
        <div className="bg-surface border-line text-muted flex items-start gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <p className="text-ink font-bold">אין מסע קנוני לנכס הזה</p>
            <p className="text-xs">{journey.fallbackReason} — לכן אין כאן פעולות שלב.</p>
          </div>
        </div>
      )}

      {/* Progress header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted text-xs font-semibold">שלב נוכחי</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl">
              <Icon name={STAGE_DEFS[legacyForChecklist].icon} size={18} />
            </span>
            <h3 className="text-ink text-lg font-black">{journey.stageLabel || "—"}</h3>
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
          <div className="text-end">
            <p className={cn("text-3xl font-black", healthColor)}>{health}</p>
            <p className="text-muted text-xs font-semibold">ציון בריאות</p>
          </div>
        </div>
      </div>

      <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all"
          style={{ width: `${journey.progress}%` }}
        />
      </div>

      {/* Next recommended action */}
      <div className="bg-brand-soft text-brand-strong flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
        <Icon name="ArrowUpRight" size={18} />
        <span className="text-muted">הפעולה המומלצת הבאה:</span>
        <span className="text-ink font-bold">{recommended}</span>
      </div>

      {/* BLOCKERS — observed facts from the canonical journey, never guesses. */}
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

      {/* The CANONICAL ladder. Rendered from the machine, not from a private list. */}
      {journey.ladder.length > 0 && (
        <div className="no-scrollbar -mx-1 overflow-x-auto pb-2">
          <div className="relative flex min-w-[720px] items-start justify-between px-1">
            <span className="bg-line absolute end-5 start-5 top-5 h-0.5" />
            {journey.ladder.map((s) => (
              <div
                key={s.key}
                className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2 transition",
                    s.done && "bg-success border-success text-white",
                    s.current &&
                      (stalled
                        ? "bg-danger border-danger text-white"
                        : "bg-brand border-brand text-white"),
                    !s.done && !s.current && "bg-card border-line text-muted",
                  )}
                >
                  <Icon name={STAGE_DEFS[checklistStage(s.key)].icon} size={16} />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-bold leading-tight",
                    s.current ? "text-brand-strong" : s.done ? "text-ink" : "text-muted",
                  )}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage checklist — asset completeness, not lifecycle. */}
      <div className="bg-surface rounded-2xl p-4">
        <p className="text-ink mb-3 text-sm font-extrabold">
          {missing.length
            ? `פעולות בשלב זה — ${completed.length}/${allActions.length} הושלמו`
            : "כל הפעולות בשלב זה הושלמו ✓"}
        </p>
        {allActions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {completed.map((a) => (
              <li key={a.key} className="flex items-center gap-2 text-sm">
                <span className="bg-success grid h-5 w-5 place-items-center rounded-full text-white">
                  <Icon name="UserCheck" size={12} />
                </span>
                <span className="text-muted line-through">{a.label}</span>
              </li>
            ))}
            {missing.map((a) => (
              <li key={a.key} className="flex items-center gap-2 text-sm">
                <span className="border-line text-muted grid h-5 w-5 place-items-center rounded-full border">
                  <Icon name="Minus" size={12} />
                </span>
                <span className="text-ink">{a.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* COMMANDS — 5.5G: only what is legal RIGHT NOW is rendered. Never a dead button. */}
      <div className="flex flex-wrap items-center gap-2">
        {canOverride && prevRung && (
          <Button
            variant="ghost"
            onClick={() => go(prevRung.key)}
            disabled={pending}
            leadingIcon={<Icon name="ChevronRight" size={16} />}
          >
            החזר ל{prevRung.label}
          </Button>
        )}
        {canAdvance && nextMilestone && (
          <Button
            variant="primary"
            onClick={() => go(nextMilestone.key)}
            disabled={pending}
            leadingIcon={<Icon name="ArrowUpRight" size={16} />}
          >
            קדם ל{nextMilestone.label}
          </Button>
        )}
        {journey.stageEnteredAt && (
          <span className="text-muted text-xs">
            בשלב זה מאז {fmtDate(journey.stageEnteredAt)}
            {journey.stageAgeDays !== null ? ` (${journey.stageAgeDays} ימים)` : ""}
          </span>
        )}
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* REAL transition history — journey_events, not a reconstruction. */}
      {journey.history.length > 0 && (
        <div>
          <p className="text-ink mb-3 text-sm font-extrabold">היסטוריית שלבים</p>
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
        </div>
      )}

      {/* Activity feed */}
      <div>
        <p className="text-ink mb-3 text-sm font-extrabold">יומן פעילות</p>
        {activities.length === 0 ? (
          <p className="text-muted text-sm">אין פעילות מתועדת עדיין.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activities.slice(0, 12).map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className="bg-brand-soft text-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                  <Icon name="Clock" size={15} />
                </span>
                <div>
                  <p className="text-ink text-sm font-semibold">{a.subject ?? a.type}</p>
                  {a.body && <p className="text-muted text-xs">{a.body}</p>}
                  <p className="text-muted text-[11px]">{fmtDate(a.occurred_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
