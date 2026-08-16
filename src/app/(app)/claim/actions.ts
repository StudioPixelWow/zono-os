"use server";
// ============================================================================
// ZONO — Claim My Listings · server actions (client entry points) — P10A.
// The client inbox calls these to (a) fetch scored candidates and (b) perform
// the real, server-authoritative decisions: claim ("שלי") / reject / snooze.
// All authority (org/owner/evidence) is resolved server-side; the client only
// passes a listing id + an explicit low-confidence confirmation flag.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getClaimCandidates } from "@/lib/claim/claim-candidate-service";
import { claimExternalListing, rejectClaimCandidate, snoozeClaimCandidate } from "@/lib/claim/claim-write-service";

export interface ClaimCandidateDTO {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  rooms: string | null;
  sqm: number | null;
  imageCount: number;
  primaryImage: string | null;
  source: string | null;
  listingUrl: string | null;
  contactName: string | null;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  cautions: string[];
  phoneNote: string;
  needsConfirmation: boolean; // LOW / office-only / contradiction
  alreadyPromoted: boolean;
}

export async function fetchClaimCandidatesAction(): Promise<{ ready: boolean; candidates: ClaimCandidateDTO[] }> {
  const { anchor, candidates } = await getClaimCandidates(30);
  return {
    ready: Boolean(anchor?.ready),
    candidates: candidates.map((c) => {
      const hasContradiction = c.verdict.cautions.some((x) => x.includes("טלפון") && x.includes("שונה"));
      const weak = c.verdict.confidence === "low" || c.verdict.officeLevelOnly || hasContradiction;
      return {
        id: c.externalListingId, title: c.title, city: c.city, neighborhood: c.neighborhood,
        price: c.price, rooms: c.rooms, sqm: c.sqm, imageCount: c.imageCount, primaryImage: c.primaryImage,
        source: c.source, listingUrl: c.listingUrl, contactName: c.contactName,
        confidence: c.verdict.confidence ?? "low", reasons: c.verdict.reasons, cautions: c.verdict.cautions,
        phoneNote: c.phoneNote, needsConfirmation: weak, alreadyPromoted: c.alreadyPromoted,
      };
    }),
  };
}

export async function claimListingAction(listingId: string, confirmLowConfidence = false) {
  const res = await claimExternalListing(listingId, { confirmLowConfidence });
  if (res.ok) { revalidatePath("/claim"); revalidatePath("/today"); revalidatePath("/properties"); }
  return res;
}

export async function rejectListingAction(listingId: string) {
  const res = await rejectClaimCandidate(listingId);
  if (res.ok) { revalidatePath("/claim"); revalidatePath("/today"); }
  return res;
}

/** Snooze a candidate (reuses broker_match_reviews — no new table, no property write). */
export async function snoozeListingAction(listingId: string, window: "tomorrow" | "week" | "default" = "tomorrow") {
  const res = await snoozeClaimCandidate(listingId, window);
  if (res.ok) revalidatePath("/claim");
  return res;
}
