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
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { JourneyCockpitBlock } from "@/components/journey/JourneyCockpitBlock";
import type { CockpitJourney } from "@/lib/journey-cockpit/types";
import {
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
  void propertyId; // the block commands the journey by entity id off the model itself

  const legacyForChecklist = checklistStage(journey.currentStage);
  const allActions = requiredActions(legacyForChecklist, context);
  const missing = missingActions(legacyForChecklist, context);
  const completed = allActions.filter((a) => a.done);
  const recommended = nextRecommendedAction(legacyForChecklist, context);
  const health = healthScore(legacyForChecklist, context, journey.lastActivityAt);
  const hTone = healthTone(health);
  const healthColor =
    hTone === "good" ? "text-success" : hTone === "medium" ? "text-brand-strong" : "text-danger";

  return (
    <JourneyCockpitBlock journey={journey}>
      {/* ── PROPERTY-SPECIFIC CONTEXT — it EXTENDS the shared block, never forks it ── */}

      {/* Next recommended action + asset health (both derived from the CHECKLIST, which is
          about completeness — price, photos, description — not about lifecycle position). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-brand-soft text-brand-strong flex flex-1 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
          <Icon name="ArrowUpRight" size={18} />
          <span className="text-muted">הפעולה המומלצת הבאה:</span>
          <span className="text-ink font-bold">{recommended}</span>
        </div>
        <div className="text-end">
          <p className={cn("text-3xl font-black", healthColor)}>{health}</p>
          <p className="text-muted text-xs font-semibold">ציון בריאות הנכס</p>
        </div>
      </div>

      {/* Stage checklist — asset completeness. */}
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

      {/* Activity feed (property activities — not journey history; the block renders that). */}
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
    </JourneyCockpitBlock>
  );
}
