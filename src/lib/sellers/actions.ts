"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createSeller, createSeller360, updateSeller360, searchSellers, type NewSellerInput } from "./repository";
import { propertySellerRepository, type LinkSellerInput, validatePropertySellerReadiness, type SellerReadiness } from "./propertySellers";
import { getPropertySellers, type PropertySellerView } from "./service360";
import { initializeSellerIntelligence } from "@/lib/seller-intelligence/service";
import { logActivityEvent } from "@/lib/activity/service";
import type { Seller360Input } from "./types";

export interface SellerCrudState {
  error?: string;
}

export interface SellerSearchResult {
  id: string;
  fullName: string;
  phone: string | null;
}

export async function searchSellersAction(query: string): Promise<SellerSearchResult[]> {
  try {
    const rows = await searchSellers(query);
    return rows.map((s) => ({ id: s.id, fullName: s.full_name, phone: s.phone }));
  } catch (e) {
    console.error("[seller] search failed:", e);
    return [];
  }
}

/** Create a rich Seller 360 profile; optionally link to a property and return. */
export async function createSeller360Action(
  input: Seller360Input,
  propertyId?: string | null,
): Promise<SellerCrudState> {
  if (!input.fullName?.trim()) return { error: "נא להזין שם מלא." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  let id: string;
  try {
    const seller = await createSeller360(input, profile.org_id, user.id);
    id = seller.id;
    await logActivityEvent({ eventType: "seller.created", entityType: "seller", entityId: id, title: "נוצר מוכר חדש (360)" });
    if (propertyId) {
      await propertySellerRepository.link(profile.org_id, { propertyId, sellerId: id, relationshipType: "owner", isPrimary: true, isDecisionMaker: true, canSign: true });
      await logActivityEvent({ eventType: "seller.linked_to_property", entityType: "property", entityId: propertyId, relatedEntityType: "seller", relatedEntityId: id, title: "מוכר קושר לנכס" });
    }
    await initializeSellerIntelligence(id).catch((e) => console.error("[seller] auto-init failed:", e));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] 360 create failed:", e);
    return { error: `יצירת המוכר נכשלה: ${msg}` };
  }
  revalidatePath("/sellers");
  if (propertyId) {
    revalidatePath(`/properties/${propertyId}`);
    redirect(`/properties/${propertyId}`);
  }
  redirect(`/sellers/${id}`);
}

export async function updateSeller360Action(id: string, input: Seller360Input): Promise<SellerCrudState> {
  if (!input.fullName?.trim()) return { error: "נא להזין שם מלא." };
  try {
    await updateSeller360(id, input);
    await logActivityEvent({ eventType: "seller.updated", entityType: "seller", entityId: id, title: "פרטי המוכר עודכנו" });
    const { recalculateSellerIntelligence } = await import("@/lib/seller-intelligence/service");
    await recalculateSellerIntelligence(id).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון המוכר נכשל: ${msg}` };
  }
  revalidatePath(`/sellers/${id}`);
  redirect(`/sellers/${id}`);
}

// ── Property↔seller linking ──────────────────────────────────────────────────
export async function linkSellerToPropertyAction(input: LinkSellerInput): Promise<SellerCrudState> {
  const { profile } = await getSessionContext();
  if (!profile) return { error: "לא מחובר/ת." };
  try {
    await propertySellerRepository.link(profile.org_id, input);
    await logActivityEvent({ eventType: "seller.linked_to_property", entityType: "property", entityId: input.propertyId, relatedEntityType: "seller", relatedEntityId: input.sellerId, title: "מוכר קושר לנכס" });
    const { recalculatePropertyIntelligence } = await import("@/lib/intelligence/service");
    await recalculatePropertyIntelligence(input.propertyId).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `קישור המוכר נכשל: ${msg}` };
  }
  revalidatePath(`/properties/${input.propertyId}`);
  return {};
}

export async function unlinkSellerFromPropertyAction(linkId: string, propertyId: string): Promise<SellerCrudState> {
  try {
    await propertySellerRepository.unlink(linkId);
    await logActivityEvent({ eventType: "seller.unlinked_from_property", entityType: "property", entityId: propertyId, title: "מוכר הוסר מהנכס" });
    const { recalculatePropertyIntelligence } = await import("@/lib/intelligence/service");
    await recalculatePropertyIntelligence(propertyId).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `הסרת המוכר נכשלה: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  return {};
}

export async function setPropertySellerRoleAction(
  linkId: string,
  propertyId: string,
  patch: { is_primary?: boolean; is_decision_maker?: boolean; can_sign?: boolean; relationship_type?: string; ownership_percentage?: number | null },
): Promise<SellerCrudState> {
  try {
    if (patch.is_primary) await propertySellerRepository.setPrimary(propertyId, linkId);
    else await propertySellerRepository.update(linkId, patch);
    await logActivityEvent({ eventType: "seller.role_changed", entityType: "property", entityId: propertyId, title: "תפקיד מוכר עודכן" });
    const { recalculatePropertyIntelligence } = await import("@/lib/intelligence/service");
    await recalculatePropertyIntelligence(propertyId).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון התפקיד נכשל: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  return {};
}

// ── Wizard inline seller (no redirect — stays inside the property wizard) ─────
export interface PropertySellerState {
  sellers: PropertySellerView[];
  readiness: SellerReadiness;
}

/** Load current sellers + readiness for a property (used by the wizard step). */
export async function getPropertySellerStateAction(
  propertyId: string,
): Promise<PropertySellerState> {
  try {
    const [sellers, readiness] = await Promise.all([
      getPropertySellers(propertyId),
      validatePropertySellerReadiness(propertyId),
    ]);
    return { sellers, readiness };
  } catch (e) {
    console.error("[seller] wizard state failed:", e);
    return {
      sellers: [],
      readiness: { ready: false, hasActiveSeller: false, hasDecisionMaker: false, hasSigner: false, hasContactMethod: false, reasons: ["שגיאה בטעינת מוכרים"] },
    };
  }
}

export interface WizardSellerInput extends Seller360Input {
  relationshipType?: string;
  ownershipPercentage?: number | null;
  isPrimary?: boolean;
  isDecisionMaker?: boolean;
  canSign?: boolean;
}

/** Create a seller inline and link it to the property; returns refreshed state. */
export async function createAndLinkSellerAction(
  propertyId: string,
  input: WizardSellerInput,
): Promise<SellerCrudState & { state?: PropertySellerState }> {
  if (!input.fullName?.trim()) return { error: "נא להזין שם מלא." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const seller = await createSeller360(input, profile.org_id, user.id);
    await propertySellerRepository.link(profile.org_id, {
      propertyId,
      sellerId: seller.id,
      relationshipType: input.relationshipType ?? "owner",
      ownershipPercentage: input.ownershipPercentage ?? null,
      isPrimary: input.isPrimary ?? true,
      isDecisionMaker: input.isDecisionMaker ?? true,
      canSign: input.canSign ?? true,
    });
    await logActivityEvent({ eventType: "seller.created", entityType: "seller", entityId: seller.id, title: "נוצר מוכר חדש מתוך אשף הנכס" });
    await logActivityEvent({ eventType: "seller.linked_to_property", entityType: "property", entityId: propertyId, relatedEntityType: "seller", relatedEntityId: seller.id, title: "מוכר קושר לנכס" });
    await initializeSellerIntelligence(seller.id).catch((e) => console.error("[seller] auto-init failed:", e));
    const { recalculatePropertyIntelligence } = await import("@/lib/intelligence/service");
    await recalculatePropertyIntelligence(propertyId).catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] wizard create+link failed:", e);
    return { error: `יצירת המוכר נכשלה: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  return { state: await getPropertySellerStateAction(propertyId) };
}

export async function createSellerAction(input: NewSellerInput): Promise<SellerCrudState> {
  if (!input.fullName?.trim()) return { error: "נא להזין שם מלא." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  let id: string;
  try {
    const seller = await createSeller(input, profile.org_id, user.id);
    id = seller.id;
    // Spin up the seller digital twin immediately.
    await initializeSellerIntelligence(id).catch((e) => console.error("[seller] auto-init failed:", e));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] create failed:", e);
    return { error: `יצירת המוכר נכשלה: ${msg}` };
  }
  revalidatePath("/sellers");
  redirect(`/sellers/${id}`);
}
