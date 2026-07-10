"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PropertyStatus } from "@/lib/supabase/types";
import {
  archiveProperty,
  createProperty,
  setPropertyStatus,
  updateProperty,
  type PropertyInput,
} from "./repository";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { findOpenDealsForProperty, type OpenDealLite } from "@/lib/deals/deal-property-sync";
import { advanceDealStage } from "@/lib/deals/service";
import { logActivityEvent } from "@/lib/activity/service";
import { EVENT_TYPES } from "@/lib/activity/types";

/** Read the open deals linked to a property (for a future explicit sold-confirmation UI). */
export async function getPropertyOpenDealsAction(propertyId: string): Promise<{ deals: OpenDealLite[] }> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { deals: [] };
  const db = await createClient();
  return { deals: await findOpenDealsForProperty(db, profile.org_id, propertyId) };
}

/** Stage 0.2 · property marked sold/rented → reconcile the linked deal(s).
 *  - exactly one active linked deal → close it as won (property already sold ⇒ deal's
 *    own property-sync is a no-op, so no divergence, no double-apply).
 *  - multiple → do NOT auto-close any (never close the wrong deal); flag on the timeline.
 *  - none → nothing to reconcile. */
async function reconcileDealsOnPropertySold(propertyId: string): Promise<void> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return;
    const db = await createClient();
    const open = await findOpenDealsForProperty(db, profile.org_id, propertyId);
    if (open.length === 1) {
      await advanceDealStage(open[0].profileId, "closed");
    } else if (open.length > 1) {
      await logActivityEvent({
        eventType: EVENT_TYPES.propertySold, entityType: "property", entityId: propertyId,
        title: "הנכס סומן כנמכר — יש לבחור ידנית איזו עסקה לסגור",
        description: `${open.length} עסקאות פתוחות מקושרות לנכס`, metadata: { via: "manual", ambiguous: true },
      });
    }
  } catch (e) { console.error("[properties] deal reconcile failed:", e); }
}

export interface PropertyActionState {
  error?: string;
}

function validate(input: PropertyInput): string | null {
  if (!input.title?.trim()) return "נא להזין כותרת לנכס.";
  if (input.price == null || Number.isNaN(input.price) || input.price < 0)
    return "נא להזין מחיר תקין.";
  return null;
}

export async function createPropertyAction(
  input: PropertyInput,
): Promise<PropertyActionState> {
  const err = validate(input);
  if (err) return { error: err };

  let id: string;
  try {
    const created = await createProperty(input);
    id = created.id;
  } catch (e) {
    console.error("[properties] create failed:", e);
    return { error: "יצירת הנכס נכשלה. נסה/י שוב." };
  }
  // STABILIZATION: emit the canonical creation event (was missing) → timeline /
  // search / graph. Best-effort; emit never throws, and must run before redirect().
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.propertyCreated, entityType: "property", entityId: id });
  } catch (e) { console.error("[properties] create emit failed:", e); }
  revalidatePath("/properties");
  redirect(`/properties/${id}?created=property`);
}

export async function updatePropertyAction(
  id: string,
  input: PropertyInput,
): Promise<PropertyActionState> {
  const err = validate(input);
  if (err) return { error: err };

  // Detect a price change so we can emit the more-specific canonical event.
  let priceChanged = false;
  let oldPrice: number | null = null;
  try {
    const { getPropertyById } = await import("./repository");
    const prev = await getPropertyById(id).catch(() => null);
    oldPrice = (prev?.price ?? null) as number | null;
    await updateProperty(id, input);
    priceChanged = oldPrice != null && input.price != null && Number(oldPrice) !== Number(input.price);
  } catch (e) {
    console.error("[properties] update failed:", e);
    return { error: "עדכון הנכס נכשל. נסה/י שוב." };
  }
  // STABILIZATION: emit EXACTLY ONE canonical event per mutation — price_changed
  // is more specific than updated (mirrors the setPropertyStatusAction ternary).
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type: priceChanged ? DOMAIN_EVENTS.propertyPriceChanged : DOMAIN_EVENTS.propertyUpdated,
      entityType: "property", entityId: id,
      payload: priceChanged ? { oldPrice, newPrice: input.price } : {},
    });
  } catch (e) { console.error("[properties] update emit failed:", e); }
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}

export async function setPropertyStatusAction(
  id: string,
  status: PropertyStatus,
): Promise<PropertyActionState> {
  // Publishing requires seller readiness — same gate as the wizard publish,
  // so the detail-page status dropdown can't bypass it.
  if (status === "published") {
    try {
      const { validatePropertySellerReadiness } = await import("@/lib/sellers/propertySellers");
      const readiness = await validatePropertySellerReadiness(id);
      if (!readiness.ready) {
        return { error: "כדי לפרסם נכס, יש לקשר לפחות מוכר אחד ולקבוע מי מקבל החלטות." };
      }
    } catch (e) {
      console.error("[properties] readiness check failed:", e);
    }
  }
  try {
    await setPropertyStatus(id, status);
  } catch (e) {
    console.error("[properties] status change failed:", e);
    return { error: "שינוי הסטטוס נכשל." };
  }
  // Stage 1: emit the property status change through the kernel.
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    const evt = status === "sold" || status === "rented" ? DOMAIN_EVENTS.propertySold : status === "published" ? DOMAIN_EVENTS.propertyPublished : DOMAIN_EVENTS.propertyStatusChanged;
    await emitBusinessEvent({ type: evt, entityType: "property", entityId: id, payload: { status } });
  } catch (e) { console.error("[properties] emit failed:", e); }
  // Stage 0.2: a manual sold/rented must reconcile the linked deal (no divergence).
  if (status === "sold" || status === "rented") {
    await reconcileDealsOnPropertySold(id);
    revalidatePath("/deals");
  }
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
  return {};
}

export async function archivePropertyAction(
  id: string,
): Promise<PropertyActionState> {
  try {
    await archiveProperty(id);
  } catch (e) {
    console.error("[properties] archive failed:", e);
    return { error: "העברה לארכיון נכשלה." };
  }
  revalidatePath("/properties");
  redirect("/properties");
}
