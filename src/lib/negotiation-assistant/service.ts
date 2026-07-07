// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — service (server-only). PHASE 59.0.
// Assembles negotiation context for a property: asking price + recent CRM/voice
// notes (for objection + legal detection), reusing the Activity Timeline. Offers
// and any valuation number are supplied BY THE BROKER (never fabricated by AI):
// if no valuation is provided, the engine explicitly says so and stays relative.
// Read-only; org-scoped via RLS. Drafts remain draft-only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEntityTimeline } from "@/lib/activity/service";
import { assembleNegotiationPlan } from "./engine";
import type { NegotiationInput, NegotiationPlan, OfferInput } from "./types";

type Rec = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface NegotiationPropertyLite { id: string; title: string; price: number | null; city: string | null }

/** Recent active properties for the negotiation picker. */
export async function listNegotiationProperties(): Promise<NegotiationPropertyLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select("id,title,price,city,status,updated_at").order("updated_at", { ascending: false }).limit(60);
  return ((data ?? []) as unknown as Rec[])
    .filter((r) => ["active", "published", "ready", "under_offer", "in_contract"].includes(String(r.status)))
    .map((r) => ({ id: String(r.id), title: s(r.title) ?? "נכס", price: num(r.price), city: s(r.city) }));
}

/** Base context (property + notes) for a property. Offers/valuation are broker inputs. */
async function getContext(propertyId: string): Promise<{ property: NegotiationInput["property"]; notes: string[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select("id,title,price,city").eq("id", propertyId).maybeSingle();
  const p = data as Rec | null;
  if (!p) return null;
  const timeline = await getEntityTimeline("property", propertyId).catch(() => []);
  const notes = (timeline ?? []).slice(0, 40).map((e) => [s((e as Rec).title), s((e as Rec).description)].filter(Boolean).join(" — ")).filter(Boolean);
  return { property: { id: String(p.id), title: s(p.title) ?? "נכס", askingPrice: num(p.price), city: s(p.city) }, notes };
}

export interface BuildPlanInput {
  propertyId: string;
  offers: OfferInput[];
  valuationEstimate?: number | null;   // broker-provided; AI never fabricates one
  sellerFlexibility?: number | null;
  buyerUrgency?: number | null;
  extraNotes?: string[];
}

/** Build the negotiation plan from property context + broker-supplied offers/valuation. */
export async function buildNegotiationPlan(input: BuildPlanInput): Promise<NegotiationPlan | null> {
  const ctx = await getContext(input.propertyId);
  if (!ctx) return null;

  const negInput: NegotiationInput = {
    property: ctx.property,
    valuation: input.valuationEstimate != null
      ? { estimated: input.valuationEstimate, low: Math.round(input.valuationEstimate * 0.95), high: Math.round(input.valuationEstimate * 1.05), confidence: 60 }
      : null,
    offers: input.offers ?? [],
    sellerSignals: { flexibility: input.sellerFlexibility ?? null, daysOnMarket: null, priceReductions: 0 },
    buyerSignals: { urgency: input.buyerUrgency ?? null, readiness: null, competingInterest: (input.offers?.length ?? 0) > 1 },
    notes: [...ctx.notes, ...(input.extraNotes ?? [])],
  };

  const plan = assembleNegotiationPlan(negInput);
  plan.generatedAt = new Date().toISOString();
  return plan;
}
