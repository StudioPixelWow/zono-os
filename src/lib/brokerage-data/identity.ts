// ============================================================================
// ZONO Core Data — Broker Identity Resolution engine (pure, client-safe).
// Given a scraped listing's contact (name / phone / office / city), resolve it
// against known brokerage agents + offices and produce a confidence score, a
// decision tier, and human-readable reasons. Evidence-first & deterministic:
//   • a matching phone is strong, near-certain evidence
//   • name + city agreement is supporting evidence
//   • name-only / city-only is weak → candidate, never auto-linked
// Confidence tiers (per spec):
//   ≥ 95  → auto_link        (status: auto_linked / verified link)
//   70-95 → pending_review   (a human confirms)
//   < 70  → candidate        (kept for evidence, not asserted)
// Never invents links; never overwrites without a reason.
// ============================================================================
import { normalizeHebrewName, normalizePhoneNumber, normalizeOfficeName, sameCity } from "./normalize";
import { compareNames } from "@/lib/broker/engine";

export type ResolutionTier = "auto_link" | "pending_review" | "candidate" | "none";

export const AUTO_LINK_THRESHOLD = 95;
export const REVIEW_THRESHOLD = 70;

export interface ListingContact {
  name?: string | null;       // contact_name from the external listing
  phone?: string | null;      // contact_phone
  office?: string | null;     // office/agency name if present
  city?: string | null;
}

// A minimal projection of a brokerage agent for matching.
export interface AgentCandidate {
  id: string;
  fullName: string;
  normalizedName?: string | null;
  primaryPhone?: string | null;
  whatsappPhone?: string | null;
  city?: string | null;
  officeId?: string | null;
}

// A minimal projection of a brokerage office for matching.
export interface OfficeCandidate {
  id: string;
  name: string;
  normalizedName?: string | null;
  primaryPhone?: string | null;
  city?: string | null;
}

export interface ResolutionResult {
  agentId: string | null;
  officeId: string | null;
  confidence: number;          // 0..100
  tier: ResolutionTier;
  reasons: string[];           // human-readable evidence
  matchedPhone: string | null;
  matchedName: string | null;
}

function tierFor(confidence: number): ResolutionTier {
  if (confidence >= AUTO_LINK_THRESHOLD) return "auto_link";
  if (confidence >= REVIEW_THRESHOLD) return "pending_review";
  if (confidence > 0) return "candidate";
  return "none";
}

/** Score one agent against the listing contact (0..100) with reasons. */
export function scoreAgent(contact: ListingContact, agent: AgentCandidate): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const cPhone = normalizePhoneNumber(contact.phone);
  const aPhones = [agent.primaryPhone, agent.whatsappPhone].map(normalizePhoneNumber).filter(Boolean);
  const phoneHit = !!cPhone && aPhones.includes(cPhone);
  if (phoneHit) { score += 80; reasons.push("טלפון זהה לסוכן"); }

  const nameSim = compareNames(contact.name, agent.fullName);
  if (nameSim >= 0.99) { score += phoneHit ? 18 : 55; reasons.push("שם זהה"); }
  else if (nameSim >= 0.6) { score += phoneHit ? 10 : 30; reasons.push("שם דומה"); }

  const cityHit = sameCity(contact.city, agent.city);
  if (cityHit) { score += phoneHit || nameSim >= 0.6 ? 8 : 5; reasons.push("אותו אזור פעילות"); }

  // Guardrail: name-only or city-only evidence is weak — cap below review.
  if (!phoneHit && nameSim < 0.6) score = Math.min(score, 40);

  return { score: Math.min(100, Math.round(score)), reasons };
}

/** Score one office against the listing contact (0..100) with reasons. */
export function scoreOffice(contact: ListingContact, office: OfficeCandidate): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const cPhone = normalizePhoneNumber(contact.phone);
  const oPhone = normalizePhoneNumber(office.primaryPhone);
  const phoneHit = !!cPhone && cPhone === oPhone;
  if (phoneHit) { score += 75; reasons.push("טלפון זהה למשרד"); }

  const officeNameNorm = normalizeOfficeName(contact.office);
  const officeSim = office.normalizedName
    ? compareNames(officeNameNorm, office.normalizedName)
    : compareNames(contact.office, office.name);
  if (officeSim >= 0.99) { score += phoneHit ? 20 : 55; reasons.push("שם משרד זהה"); }
  else if (officeSim >= 0.6) { score += phoneHit ? 12 : 30; reasons.push("שם משרד דומה"); }

  const cityHit = sameCity(contact.city, office.city);
  if (cityHit) { score += phoneHit || officeSim >= 0.6 ? 8 : 5; reasons.push("אותו אזור"); }

  if (!phoneHit && officeSim < 0.6) score = Math.min(score, 40);
  return { score: Math.min(100, Math.round(score)), reasons };
}

/**
 * Resolve a listing contact against the known data. Picks the best agent and the
 * best office; an agent's own office is preferred for the office link when the
 * agent is the stronger signal. Returns a single decision with tier.
 */
export function resolveIdentity(
  contact: ListingContact,
  agents: AgentCandidate[],
  offices: OfficeCandidate[],
): ResolutionResult {
  let bestAgent: { agent: AgentCandidate; score: number; reasons: string[] } | null = null;
  for (const a of agents) {
    const r = scoreAgent(contact, a);
    if (r.score > 0 && (!bestAgent || r.score > bestAgent.score)) bestAgent = { agent: a, score: r.score, reasons: r.reasons };
  }

  let bestOffice: { office: OfficeCandidate; score: number; reasons: string[] } | null = null;
  for (const o of offices) {
    const r = scoreOffice(contact, o);
    if (r.score > 0 && (!bestOffice || r.score > bestOffice.score)) bestOffice = { office: o, score: r.score, reasons: r.reasons };
  }

  // Prefer the agent's linked office when the agent is the dominant signal.
  let officeId: string | null = bestOffice?.office.id ?? null;
  const reasons: string[] = [];
  if (bestAgent) reasons.push(...bestAgent.reasons.map((r) => `סוכן: ${r}`));
  if (bestAgent?.agent.officeId && (!bestOffice || bestAgent.score >= bestOffice.score)) {
    officeId = bestAgent.agent.officeId;
    reasons.push("משרד דרך הסוכן");
  } else if (bestOffice) {
    reasons.push(...bestOffice.reasons.map((r) => `משרד: ${r}`));
  }

  const confidence = Math.max(bestAgent?.score ?? 0, bestOffice?.score ?? 0);
  return {
    agentId: bestAgent?.agent.id ?? null,
    officeId,
    confidence,
    tier: tierFor(confidence),
    reasons,
    matchedPhone: normalizePhoneNumber(contact.phone) || null,
    matchedName: contact.name ? normalizeHebrewName(contact.name) : null,
  };
}

// ── Duplicate detection (within the brokerage tables themselves) ─────────────
/** Score two agents as potential duplicates (0..100). */
export function scoreAgentDuplicate(a: AgentCandidate, b: AgentCandidate): number {
  if (a.id === b.id) return 0;
  const pa = [a.primaryPhone, a.whatsappPhone].map(normalizePhoneNumber).filter(Boolean);
  const pb = [b.primaryPhone, b.whatsappPhone].map(normalizePhoneNumber).filter(Boolean);
  const phoneHit = pa.some((p) => pb.includes(p));
  const nameSim = compareNames(a.fullName, b.fullName);
  let s = 0;
  if (phoneHit) s += 70;
  if (nameSim >= 0.99) s += phoneHit ? 25 : 50;
  else if (nameSim >= 0.6) s += phoneHit ? 15 : 25;
  if (sameCity(a.city, b.city)) s += 5;
  if (!phoneHit && nameSim < 0.6) s = Math.min(s, 40);
  return Math.min(100, Math.round(s));
}
