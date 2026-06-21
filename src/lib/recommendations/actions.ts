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

const revalidate = () => {
  revalidatePath("/recommendations");
  revalidatePath("/recommendations/map");
  revalidatePath("/");
  revalidatePath("/command");
};

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
export const generateBuyerRecommendationsAction = (buyerId: string) =>
  run(() => generateBuyerRecommendations(buyerId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
export const generateSellerRecommendationsAction = (sellerId: string) =>
  run(() => generateSellerRecommendations(sellerId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
export const generatePropertyRecommendationsAction = (propertyId: string) =>
  run(() => generatePropertyRecommendations(propertyId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
export const generateLeadRecommendationsAction = (leadId: string) =>
  run(() => generateLeadRecommendations(leadId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
export const generateAcquisitionRecommendationsAction = (acquisitionProfileId: string) =>
  run(() => generateAcquisitionRecommendations(acquisitionProfileId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);
export const generateDealRecommendationsAction = (dealProfileId: string) =>
  run(() => generateDealRecommendations(dealProfileId), (r) => `נוצרו ${(r as { created: number }).created} המלצות`);

// ── Packages + map ───────────────────────────────────────────────────────────
export const buildRecommendationPackageAction = (entityType: string, entityId: string, packageType: string) =>
  run(() => buildRecommendationPackage(entityType, entityId, packageType), (r) => `נבנתה חבילה עם ${(r as { recommendations: number }).recommendations} המלצות`);
export const generateRecommendationMapPointsAction = () =>
  run(() => generateRecommendationMapPoints(), (r) => `${(r as { points: number }).points} נקודות על המפה`);

// ── Lifecycle ────────────────────────────────────────────────────────────────
export const approveRecommendationAction = (id: string) =>
  run(() => reviewRecommendation(id, "approved"), () => "ההמלצה אושרה");
export const rejectRecommendationAction = (id: string) =>
  run(() => reviewRecommendation(id, "rejected"), () => "ההמלצה נדחתה");
export const markRecommendationConvertedAction = (id: string) =>
  run(() => markRecommendationConverted(id), () => "ההמלצה סומנה כהומרה");
export const createTaskFromRecommendationAction = (id: string) =>
  run(() => createTaskFromRecommendation(id), () => "נוצרה משימה מההמלצה");
export const expireStaleRecommendationsAction = () =>
  run(() => expireStaleRecommendations(), (r) => `${(r as { expired: number }).expired} המלצות פגו`);
export const recomputeAllRecommendationsAction = () =>
  run(() => recomputeAllRecommendations(), (r) => {
    const x = r as { created: number; entities: number };
    return `נוצרו ${x.created} המלצות מ-${x.entities} ישויות`;
  });
