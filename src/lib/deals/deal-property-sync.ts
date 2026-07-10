// ============================================================================
// 🔗 ZONO OS 2.0 — Stage 0.2 · Deal ⇄ Property state synchronization (server-only).
// A deal and its property must never silently diverge. This module owns the two
// terminal transitions and is IDEMPOTENT on both sides:
//   • syncPropertyOnDealWon  — a WON deal marks its linked property sold/rented.
//   • findOpenDealsForProperty — used by the property-sold flow to reconcile.
// It never overrides withdrawn/archived properties and never double-applies.
// No circular deps: this file does NOT import deals/service (which imports it).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logActivityEvent } from "@/lib/activity/service";
import { EVENT_TYPES } from "@/lib/activity/types";
import { touchJourney } from "@/lib/journey/repository";

type SB = Awaited<ReturnType<typeof createClient>>;

// Statuses from which a property may transition to sold/rented on a won deal.
const CLOSABLE = new Set(["draft", "active", "under_offer", "in_contract"]);

export interface OpenDealLite { profileId: string; dealId: string | null; title: string }

/** Deal WON → mark the linked property sold/rented. Idempotent; records timeline + journey. */
export async function syncPropertyOnDealWon(supabase: SB, orgId: string, propertyId: string | null): Promise<void> {
  if (!propertyId) return;
  const { data: prop } = await supabase.from("properties").select("id,status,title").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop) return;
  const status = prop.status as string;
  if (status === "sold" || status === "rented") return;   // already terminal — idempotent no-op
  if (!CLOSABLE.has(status)) return;                        // never override withdrawn/archived
  // Sale vs rental from the most recent linked canonical deal.
  const { data: deal } = await supabase.from("deals").select("type").eq("property_id", propertyId).eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const newStatus = deal?.type === "rent" ? "rented" : "sold";
  const { error } = await supabase.from("properties").update({ status: newStatus } as never).eq("id", propertyId).eq("org_id", orgId);
  if (error) return;
  await logActivityEvent({
    eventType: EVENT_TYPES.propertySold, entityType: "property", entityId: propertyId,
    title: `הנכס סומן כ${newStatus === "rented" ? "מושכר" : "נמכר"}: ${prop.title ?? ""}`,
    metadata: { via: "deal_won" },
  });
  await touchJourney(propertyId).catch(() => {});
}

/** Active deal projections linked to a property (used to reconcile a manual property-sold). */
export async function findOpenDealsForProperty(supabase: SB, orgId: string, propertyId: string): Promise<OpenDealLite[]> {
  const { data } = await supabase.from("deal_profiles")
    .select("id,deal_id,locality")
    .eq("organization_id", orgId).eq("property_id", propertyId).eq("status", "active");
  return (data ?? []).map((d) => ({
    profileId: d.id as string,
    dealId: (d.deal_id as string | null) ?? null,
    title: d.locality ? `עסקה · ${d.locality as string}` : "עסקה",
  }));
}
