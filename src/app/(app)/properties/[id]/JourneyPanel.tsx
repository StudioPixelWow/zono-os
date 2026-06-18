"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { setJourneyStageAction } from "@/lib/journey/actions";
import {
  JOURNEY_STAGES,
  STAGE_DEFS,
  completionPercent,
  daysSince,
  healthScore,
  healthTone,
  isStalled,
  missingActions,
  nextRecommendedAction,
  nextStage,
  prevStage,
  requiredActions,
  stageIndex,
  type JourneyContext,
} from "@/lib/journey/stages";
import type { Database, JourneyStage } from "@/lib/supabase/types";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("he-IL") : "—";

export function JourneyPanel({
  propertyId,
  stage,
  lastActivityAt,
  stageEnteredAt,
  context,
  activities,
}: {
  propertyId: string;
  stage: JourneyStage;
  lastActivityAt: string | null;
  stageEnteredAt: string | null;
  context: JourneyContext;
  activities: ActivityRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const percent = completionPercent(stage, context);
  const allActions = requiredActions(stage, context);
  const missing = missingActions(stage, context);
  const completed = allActions.filter((a) => a.done);
  const stalled = isStalled(lastActivityAt, stage);
  const next = nextStage(stage);
  const prev = prevStage(stage);
  const curIdx = stageIndex(stage);
  const health = healthScore(stage, context, lastActivityAt);
  const hTone = healthTone(health);
  const recommended = nextRecommendedAction(stage, context);

  const healthColor =
    hTone === "good" ? "text-success" : hTone === "medium" ? "text-brand-strong" : "text-danger";

  const go = (target: JourneyStage) => {
    setError(null);
    start(async () => {
      const r = await setJourneyStageAction(propertyId, target);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Progress header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted text-xs font-semibold">שלב נוכחי</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl">
              <Icon name={STAGE_DEFS[stage].icon} size={18} />
            </span>
            <h3 className="text-ink text-lg font-black">{STAGE_DEFS[stage].label}</h3>
          </div>
          <p className="text-muted mt-1 text-xs">{STAGE_DEFS[stage].description}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-end">
            <p className="text-brand-strong text-3xl font-black">{percent}%</p>
            <p className="text-muted text-xs font-semibold">השלמת מסע</p>
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
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Next recommended action */}
      <div className="bg-brand-soft text-brand-strong flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
        <Icon name="ArrowUpRight" size={18} />
        <span className="text-muted">הפעולה המומלצת הבאה:</span>
        <span className="text-ink font-bold">{recommended}</span>
      </div>

      {/* Stalled / overdue warning */}
      {stalled && (
        <div className="bg-danger-soft text-danger flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
          <Icon name="AlertTriangle" size={18} />
          הנכס תקוע — אין פעילות {daysSince(lastActivityAt)} ימים. כדאי לקדם או לעדכן.
        </div>
      )}

      {/* Timeline */}
      <div className="no-scrollbar -mx-1 overflow-x-auto pb-2">
        <div className="relative flex min-w-[640px] items-start justify-between px-1">
          <span className="bg-line absolute end-5 start-5 top-5 h-0.5" />
          {JOURNEY_STAGES.map((s, i) => {
            const state =
              i < curIdx ? "done" : i === curIdx ? "active" : "upcoming";
            return (
              <div
                key={s}
                className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2 transition",
                    state === "done" && "bg-success border-success text-white",
                    state === "active" &&
                      (stalled
                        ? "bg-danger border-danger text-white"
                        : "bg-brand border-brand text-white"),
                    state === "upcoming" && "bg-card border-line text-muted",
                  )}
                >
                  <Icon name={STAGE_DEFS[s].icon} size={16} />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-bold leading-tight",
                    state === "active"
                      ? "text-brand-strong"
                      : state === "done"
                        ? "text-ink"
                        : "text-muted",
                  )}
                >
                  {STAGE_DEFS[s].short}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage checklist — completed + pending */}
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

      {/* Stage transitions */}
      <div className="flex flex-wrap items-center gap-2">
        {prev && (
          <Button
            variant="ghost"
            onClick={() => go(prev)}
            disabled={pending}
            leadingIcon={<Icon name="ChevronRight" size={16} />}
          >
            החזר ל{STAGE_DEFS[prev].short}
          </Button>
        )}
        {next && (
          <Button
            variant="primary"
            onClick={() => go(next)}
            disabled={pending}
            leadingIcon={<Icon name="ArrowUpRight" size={16} />}
          >
            קדם ל{STAGE_DEFS[next].short}
          </Button>
        )}
        <span className="text-muted text-xs">
          בשלב זה מאז {fmtDate(stageEnteredAt)}
        </span>
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
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
                  <p className="text-ink text-sm font-semibold">
                    {a.subject ?? a.type}
                  </p>
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
