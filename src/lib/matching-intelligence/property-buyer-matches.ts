// ============================================================================
// ZONO — Property buyer-match CARDS (server-only, RLS + org-scoped). A READ-ONLY
// selector: reads the already-computed match profiles for one property
// (matchIntelligenceRepository.listForProperty — no recompute) joined to the
// buyers' saved criteria, and derives the HUMAN Hebrew "why matched" via the pure
// core. Bounded (top matches). No new scoring/attribution logic.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { matchIntelligenceRepository } from "./repository";
import {
  buildWhyReasons, budgetLabel, roomsLabel, areasLabel, stageLabelHe,
  type BuyerCriteria, type WhyReason,
} from "./property-buyer-match-core";

export interface PropertyMatchFacts { price: number | null; city: string | null; neighborhood: string | null; rooms: number | null }

export interface BuyerMatchView {
  matchId: string;
  buyerId: string;
  buyerName: string;
  matchPct: number | null;      // compatibility 0..100
  closingPct: number | null;    // closing probability 0..100
  stageHe: string | null;
  budgetLabel: string | null;
  areasLabel: string | null;
  roomsLabel: string | null;
  why: WhyReason[];             // evidence-backed; empty → show fallback line
  advantage: string | null;    // engine's strongest advantage (real, may be null)
  lastContactLabel: string | null;
  whatsapp: string | null;
  tel: string | null;
  buyerHref: string;
}

const MAX_CARDS = 6;
const digits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
function lastContact(iso: string | null, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = Math.max(0, Math.floor((nowMs - t) / 86_400_000));
  return d <= 0 ? "נוצר קשר היום" : d === 1 ? "נוצר קשר אתמול" : `נוצר קשר לפני ${d} ימים`;
}

interface BuyerRow {
  id: string; full_name: string | null; phone: string | null; temperature: string | null; last_contacted_at: string | null;
  budget_min: number | null; budget_max: number | null; rooms_min: number | null; rooms_max: number | null; preferred_areas: string[] | null;
}

/** Bounded, org-scoped buyer-match cards for a property. [] on any failure — the
 *  buyers tab then shows its empty state (never fabricated matches). */
export async function getPropertyBuyerMatches(propertyId: string, facts: PropertyMatchFacts): Promise<BuyerMatchView[]> {
  if (!propertyId) return [];
  let profiles;
  try { profiles = (await matchIntelligenceRepository.listForProperty(propertyId)).filter((m) => m.match_status !== "lost").slice(0, MAX_CARDS); }
  catch { return []; }
  if (!profiles.length) return [];

  const buyerIds = [...new Set(profiles.map((m) => m.buyer_id).filter((x): x is string => !!x))];
  if (!buyerIds.length) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("buyers")
    .select("id,full_name,phone,temperature,last_contacted_at,budget_min,budget_max,rooms_min,rooms_max,preferred_areas")
    .in("id", buyerIds);
  const byId = new Map(((data ?? []) as BuyerRow[]).map((b) => [b.id, b]));

  const now = Date.now();
  const out: BuyerMatchView[] = [];
  for (const m of profiles) {
    const b = m.buyer_id ? byId.get(m.buyer_id) : null;
    if (!b) continue;
    const criteria: BuyerCriteria = {
      budgetMin: b.budget_min ?? null, budgetMax: b.budget_max ?? null,
      roomsMin: b.rooms_min ?? null, roomsMax: b.rooms_max ?? null,
      preferredAreas: b.preferred_areas ?? [],
    };
    const wa = digits(b.phone);
    out.push({
      matchId: m.id,
      buyerId: b.id,
      buyerName: (b.full_name ?? "").trim() || "קונה",
      matchPct: m.compatibility_score ?? null,
      closingPct: m.closing_probability ?? null,
      stageHe: stageLabelHe(b.temperature),
      budgetLabel: budgetLabel(criteria),
      areasLabel: areasLabel(criteria),
      roomsLabel: roomsLabel(criteria),
      why: buildWhyReasons(criteria, facts),
      advantage: (m.strongest_advantage ?? "").trim() || null,
      lastContactLabel: lastContact(b.last_contacted_at, now),
      whatsapp: wa ? `https://wa.me/${wa}` : null,
      tel: b.phone ? `tel:${digits(b.phone)}` : null,
      buyerHref: `/buyers/${b.id}`,
    });
  }
  return out;
}
