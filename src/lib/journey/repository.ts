/**
 * Property Journey repository — what is LEFT of it after Batch 5.5.
 *
 * The lifecycle moved to the canonical spine (`journeys` + `journey_events`). This file
 * no longer reads or writes a property's STAGE: getJourney() and setJourneyStage() are
 * gone, and touchJourney() now stamps the canonical row.
 *
 * What remains is not lifecycle at all — it is the ASSET CHECKLIST context (does the
 * listing have a price, photos, a description) plus one orphaned board read.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { JourneyContext } from "./stages";

export type JourneyRow = Database["public"]["Tables"]["property_journeys"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];

export interface PropertyLite {
  id: string;
  title: string;
  city: string | null;
  status: PropertyRow["status"];
  price: number | null;
  primary_image_url: string | null;
  description: string | null;
  marketing_description: string | null;
  rooms: number | null;
  size_sqm: number | null;
}

export interface JourneyItem {
  journey: JourneyRow;
  property: PropertyLite;
}

export interface JourneyBoard {
  needingAction: JourneyItem[];
  stalled: JourneyItem[];
  recentlyUpdated: JourneyItem[];
  missingAssets: JourneyItem[];
  total: number;
}

const PROP_COLS =
  "id, title, city, status, price, primary_image_url, description, marketing_description, rooms, size_sqm, latitude, longitude";

/** The full journey context for a property (checklist needs media count). */
export async function buildJourneyContext(
  p: PropertyRow,
): Promise<JourneyContext> {
  const mediaCount = await getMediaCount(p.id);
  return {
    price: p.price ?? null,
    city: p.city ?? null,
    address: (p.location as { address?: string } | null)?.address ?? null,
    rooms: p.rooms ?? null,
    sizeSqm: p.size_sqm ?? null,
    hasDescription: !!p.description?.trim(),
    hasMarketing: !!p.marketing_description?.trim(),
    hasPrimaryImage: !!p.primary_image_url,
    hasCoords: p.latitude != null && p.longitude != null,
    mediaCount,
  };
}

export async function getMediaCount(propertyId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("property_media")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  return count ?? 0;
}

// ── RETIRED IN BATCH 5.5 ─────────────────────────────────────────────────────
// getJourney()      — read `property_journeys`. The cockpit now reads the canonical
//                     spine through getCockpitJourney() (lib/journey-cockpit/service).
// setJourneyStage() — WROTE `property_journeys` from the UI. This was THE second
//                     lifecycle writer: no buildTransition(), no journey_events, no
//                     domain event. It is gone. Stage changes are commanded by
//                     emitting `property.stage_changed` and letting the kernel apply
//                     the transition to `journeys`. See lib/journey-cockpit/actions.ts.
// Both had zero callers when removed (grep-verified).

/**
 * Touch the journey's last-activity timestamp (this is what clears a "stalled" flag).
 *
 * Batch 5.5F — repointed to the CANONICAL spine. Completing a task or syncing a deal
 * used to stamp `property_journeys.last_activity_at`, a column nothing reads any more.
 * Meanwhile `journeys.last_activity_at` — the one the cockpit and the Journey Center
 * actually use to decide whether a property is stalled — never moved. A broker could
 * work a listing all week and still be told it was stuck for 14 days.
 */
export async function touchJourney(propertyId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("journeys")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("entity_type", "property")
    .eq("entity_id", propertyId);
}

/**
 * ⚠️ DEPRECATED (Batch 5.5F) — reads `property_journeys`, which nothing writes any more.
 * It has ZERO callers today (its only consumer, JourneyBoardWidgets, is itself orphaned),
 * so it is left standing rather than ripped out mid-batch — but do NOT wire it to
 * anything. The canonical board lives in the Journey Center (lib/journey-center/service).
 * It goes when the table goes.
 *
 * Dashboard board: all active journeys for the org, bucketed into
 * needing-action / stalled / recently-updated.
 */
export async function listJourneyBoard(): Promise<JourneyBoard> {
  const supabase = await createClient();
  const [journeysRes, propsRes] = await Promise.all([
    supabase.from("property_journeys").select("*"),
    supabase.from("properties").select(PROP_COLS).neq("status", "archived"),
  ]);

  const journeys = (journeysRes.data ?? []) as JourneyRow[];
  const props = (propsRes.data ?? []) as PropertyLite[];
  const byId = new Map(props.map((p) => [p.id, p]));

  const items: JourneyItem[] = [];
  for (const j of journeys) {
    const property = byId.get(j.property_id);
    if (property) items.push({ journey: j, property });
  }

  const STALE_MS = 14 * 86_400_000;
  const nowMs = Date.now();
  const isStalled = (it: JourneyItem) =>
    it.journey.current_stage !== "closed" &&
    nowMs - new Date(it.journey.last_activity_at).getTime() >= STALE_MS;

  // Needing action: not closed, and either missing a primary image once past
  // information collection, or missing a marketing description once published.
  const order = [
    "new",
    "information_collection",
    "marketing_preparation",
    "published",
    "active_marketing",
    "negotiation",
    "deal_signed",
    "closed",
  ];
  const idx = (s: string) => order.indexOf(s);
  const needsAction = (it: JourneyItem) => {
    const s = it.journey.current_stage;
    if (s === "closed") return false;
    const p = it.property;
    if (!p.price || p.price <= 0) return true;
    if (!p.city) return true;
    if (idx(s) >= idx("marketing_preparation") && !p.primary_image_url) return true;
    if (idx(s) >= idx("published") && !p.description && !p.marketing_description)
      return true;
    return false;
  };

  const stalled = items
    .filter(isStalled)
    .sort(
      (a, b) =>
        new Date(a.journey.last_activity_at).getTime() -
        new Date(b.journey.last_activity_at).getTime(),
    );

  const needingAction = items
    .filter((it) => !isStalled(it) && needsAction(it))
    .sort((a, b) => idx(a.journey.current_stage) - idx(b.journey.current_stage));

  const recentlyUpdated = [...items]
    .sort(
      (a, b) =>
        new Date(b.journey.last_activity_at).getTime() -
        new Date(a.journey.last_activity_at).getTime(),
    )
    .slice(0, 6);

  // Missing marketing assets: not closed, and lacking a primary image or any
  // marketing/description text (can't be published well without these).
  const missingAssets = items
    .filter((it) => {
      if (it.journey.current_stage === "closed") return false;
      const p = it.property;
      return !p.primary_image_url || (!p.marketing_description && !p.description);
    })
    .sort((a, b) => idx(a.journey.current_stage) - idx(b.journey.current_stage));

  return {
    needingAction: needingAction.slice(0, 6),
    stalled: stalled.slice(0, 6),
    recentlyUpdated,
    missingAssets: missingAssets.slice(0, 6),
    total: items.length,
  };
}
