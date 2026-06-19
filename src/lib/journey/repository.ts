/**
 * Property Journey repository — RLS-scoped authenticated access.
 *
 * Reads/writes go through the cookie server client so Postgres RLS enforces the
 * org boundary. Stage transitions also log a row into public.activities so the
 * journey timeline and the property activity feed stay in sync.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database, JourneyStage } from "@/lib/supabase/types";
import { STAGE_DEFS, stageProgress } from "./stages";
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

export async function getJourney(propertyId: string): Promise<JourneyRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_journeys")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Transition a property to a new journey stage. Updates the journey row
 * (stage, timestamps, progress, history) and logs a status_change activity.
 */
export async function setJourneyStage(
  propertyId: string,
  stage: JourneyStage,
): Promise<void> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");

  const supabase = await createClient();
  const current = await getJourney(propertyId);
  const now = new Date().toISOString();

  const prevEntry = current
    ? [{ stage: current.current_stage, left_at: now }]
    : [];
  const history = Array.isArray(current?.stage_history)
    ? [...(current!.stage_history as unknown[]), ...prevEntry]
    : prevEntry;

  const { error } = await supabase
    .from("property_journeys")
    .update({
      current_stage: stage,
      stage_entered_at: now,
      last_activity_at: now,
      progress: stageProgress(stage),
      stage_history: history as Database["public"]["Tables"]["property_journeys"]["Row"]["stage_history"],
    })
    .eq("property_id", propertyId);
  if (error) throw new Error(error.message);

  const fromLabel = current ? STAGE_DEFS[current.current_stage].label : "—";
  const toLabel = STAGE_DEFS[stage].label;
  await supabase.from("activities").insert({
    org_id: profile.org_id,
    actor_id: user.id,
    type: "status_change",
    direction: "internal",
    subject: `שלב המסע עודכן: ${fromLabel} ← ${toLabel}`,
    property_id: propertyId,
    occurred_at: now,
  });

  // Unified activity layer
  const { logActivityEvent } = await import("@/lib/activity/service");
  const { EVENT_TYPES } = await import("@/lib/activity/types");
  await logActivityEvent({
    eventType: EVENT_TYPES.propertyStageChanged,
    entityType: "property",
    entityId: propertyId,
    title: `שלב המסע עודכן: ${fromLabel} ← ${toLabel}`,
    status: stage,
  });
}

/** Touch the journey's last-activity timestamp (clears a stalled flag). */
export async function touchJourney(propertyId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("property_journeys")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("property_id", propertyId);
}

/**
 * Dashboard board: all active journeys for the org, bucketed into
 * needing-action / stalled / recently-updated. Two RLS-scoped reads joined in
 * JS (keeps the hand-written Database typing simple and the queries cheap).
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
