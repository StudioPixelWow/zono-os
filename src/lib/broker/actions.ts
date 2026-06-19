"use server";

import { revalidatePath } from "next/cache";
import {
  createBrokerFromListing, createBrokerProfile, decideListingMatch, decideMatchReview, importBrokersFromCsv,
  mergeBrokers, runBrokerDetectionForOrg, verifyBroker, type BrokerInput,
} from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface BrokerActionState { error?: string; ok?: boolean; message?: string }

function revalidate() {
  revalidatePath("/broker-intelligence");
  revalidatePath("/properties");
  revalidatePath("/command");
}

export async function runBrokerDetectionAction(): Promise<BrokerActionState> {
  try {
    const s = await runBrokerDetectionForOrg();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[broker] decision recalc failed:", e); }
    revalidate();
    return { ok: true, message: `נסרקו ${s.scanned} מודעות · ${s.matched} זוהו · ${s.needsReview} לבדיקה` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "זיהוי המתווכים נכשל" };
  }
}

export async function createBrokerProfileAction(input: BrokerInput): Promise<BrokerActionState> {
  try { await createBrokerProfile(input); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הפרופיל נכשלה" }; }
}

export async function importBrokersCsvAction(rows: BrokerInput[]): Promise<BrokerActionState> {
  try { const r = await importBrokersFromCsv(rows); revalidate(); return { ok: true, message: `נוצרו ${r.created} · דולגו ${r.skipped}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ייבוא ה-CSV נכשל" }; }
}

export async function decideMatchReviewAction(reviewId: string, decision: "approved" | "rejected"): Promise<BrokerActionState> {
  try { await decideMatchReview(reviewId, decision); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}

export async function verifyBrokerAction(brokerId: string): Promise<BrokerActionState> {
  try { await verifyBroker(brokerId); revalidatePath(`/broker-intelligence/${brokerId}`); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האימות נכשל" }; }
}

export async function mergeBrokersAction(keepId: string, mergeId: string): Promise<BrokerActionState> {
  try { await mergeBrokers(keepId, mergeId); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "המיזוג נכשל" }; }
}

export async function createBrokerFromListingAction(listingId: string): Promise<BrokerActionState> {
  try { await createBrokerFromListing(listingId); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המתווך נכשלה" }; }
}

export async function decideListingMatchAction(listingId: string, decision: "approved" | "rejected"): Promise<BrokerActionState> {
  try { await decideListingMatch(listingId, decision); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
