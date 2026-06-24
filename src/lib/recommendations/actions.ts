"use server";

import { revalidatePath } from "next/cache";
import {
  generateBuyerRecommendations, generateSellerRecommendations, generatePropertyRecommendations,
  generateLeadRecommendations, generateAcquisitionRecommendations, generateDealRecommendations,
  buildRecommendationPackage, generateRecommendationMapPoints, reviewRecommendation,
  markRecommendationConverted, createTaskFromRecommendation, expireStaleRecommendations,
  recomputeAllRecommendations,
} from "./service";

export interface RecActionState { ok?: boolean; error?: string; message?: string }

function revalidate() {
  revalidatePath("/recommendations");
  revalidatePath("/recommendations/map");
  revalidatePath("/");
  revalidatePath("/command");
}

// NOTE: In a "use server" module every export must be an async function — do not
// use `export const x = () => ...` arrow form (Turbopack rejects it).
async function run(fn: () => Promise<unknown>, okMsg: (r: unknown) => string): Promise<RecActionState> {
  try {
    const r = await fn();
    revalidate();
    return { ok: true, message: okMsg(r) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "פעולה נכשלה" };
  }
}

// ── Generators ───────────────────────────────────────────────────────────────
export async function generateBuyerRecommendationsAction(buyerId: string): Promise<RecActionState> {
  return run(() => generateBuyerRecommendations(buyerId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}
export async function generateSellerRecommendationsAction(sellerId: string): Promise<RecActionState> {
  return run(() => generateSellerRecommendations(sellerId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}
export async function generatePropertyRecommendationsAction(propertyId: string): Promise<RecActionState> {
  return run(() => generatePropertyRecommendations(propertyId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}
export async function generateLeadRecommendationsAction(leadId: string): Promise<RecActionState> {
  return run(() => generateLeadRecommendations(leadId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}
export async function generateAcquisitionRecommendationsAction(acquisitionProfileId: string): Promise<RecActionState> {
  return run(() => generateAcquisitionRecommendations(acquisitionProfileId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}
export async function generateDealRecommendationsAction(dealProfileId: string): Promise<RecActionState> {
  return run(() => generateDealRecommendations(dealProfileId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
}

// ── Packages + map ───────────────────────────────────────────────────────────
export async function buildRecommendationPackageAction(entityType: string, entityId: string, packageType: string): Promise<RecActionState> {
  return run(() => buildRecommendationPackage(entityType, entityId, packageType), (r) => `נבנתה חבילה עם ${(r as { recommendations: number }).recommendations} המלצות`);
}
export async function generateRecommendationMapPointsAction(): Promise<RecActionState> {
  return run(() => generateRecommendationMapPoints(), (r) => `${(r as { points: number }).points} אזורים עודכנו`);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
export async function approveRecommendationAction(id: string): Promise<RecActionState> {
  return run(() => reviewRecommendation(id, "approved"), () => "ההמלצה אושרה");
}
export async function rejectRecommendationAction(id: string): Promise<RecActionState> {
  return run(() => reviewRecommendation(id, "rejected"), () => "ההמלצה נדחתה");
}
export async function markRecommendationConvertedAction(id: string): Promise<RecActionState> {
  return run(() => markRecommendationConverted(id), () => "ההמלצה סומנה כהומרה");
}
export async function createTaskFromRecommendationAction(id: string): Promise<RecActionState> {
  return run(() => createTaskFromRecommendation(id), () => "נוצרה משימה מההמלצה");
}
export async function expireStaleRecommendationsAction(): Promise<RecActionState> {
  return run(() => expireStaleRecommendations(), (r) => `${(r as { expired: number }).expired} המלצות פגו`);
}
export async function recomputeAllRecommendationsAction(): Promise<RecActionState> {
  return run(() => recomputeAllRecommendations(), (r) => {
    const x = r as { created: number; entities: number };
    return `נוצרו ${x.created} המלצות מ-${x.entities} ישויות`;
  });
}
