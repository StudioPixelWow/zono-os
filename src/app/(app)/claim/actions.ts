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
import { requireActiveSubscription } from "@/lib/commercial/access-gate";

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
  // Central paywall guard: claiming writes a property, so it must assert the gate.
  try { await requireActiveSubscription(); } catch { return { ok: false as const, status: "refused" as const, reason: "נדרש מנוי פעיל כדי לשייך נכס." }; }
  const res = await claimExternalListing(listingId, { confirmLowConfidence });
  if (res.ok) { revalidatePath("/claim"); revalidatePath("/today"); revalidatePath("/properties"); }
  return res;
}

/** One-click "ייבא את כל הנכסים שלי" — claims every STRONG candidate at once.
 *  Strong = high confidence, not office-only / phone-contradiction, not already
 *  in the CRM. Weak/low candidates are deliberately excluded (they still require
 *  a per-listing confirmation), so a bulk import can never mass-claim a listing
 *  the evidence is unsure about. Reuses the same server-authoritative write path
 *  as a single claim; the paywall is asserted once up front. */
export async function claimAllStrongAction(): Promise<{ ok: boolean; claimed: number; media: number; failed: number; reason?: string }> {
  try { await requireActiveSubscription(); } catch { return { ok: false, claimed: 0, media: 0, failed: 0, reason: "נדרש מנוי פעיל כדי לשייך נכסים." }; }
  const { candidates } = await getClaimCandidates(60);
  const strong = candidates.filter((c) => {
    const hasContradiction = c.verdict.cautions.some((x) => x.includes("טלפון") && x.includes("שונה"));
    const weak = c.verdict.confidence === "low" || c.verdict.officeLevelOnly || hasContradiction;
    return c.verdict.confidence === "high" && !weak && !c.alreadyPromoted;
  });
  let claimed = 0, media = 0, failed = 0;
  for (const c of strong) {
    const res = await claimExternalListing(c.externalListingId, { confirmLowConfidence: false });
    if (res.ok) { claimed++; media += res.mediaImported ?? 0; } else failed++;
  }
  if (claimed > 0) { revalidatePath("/claim"); revalidatePath("/today"); revalidatePath("/properties"); }
  return { ok: true, claimed, media, failed };
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
