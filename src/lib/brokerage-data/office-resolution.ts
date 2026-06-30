// ============================================================================
// 🏢 Broker → Office Resolution (Phase 26.9.7). Server-only, evidence-based,
// additive. Resolves each broker to a brokerage office using ONLY real evidence:
//   1) match against EXISTING brokerage_offices (phone / name / city), and
//   2) SHARED-PHONE clusters — when ≥2 DISTINCT broker names publish from the
//      same phone, that line is an office switchboard, so an office candidate is
//      formed (named from the most-observed real name on that line — never an
//      invented name). Confidence scales with the number of distinct brokers.
// Thresholds: ≥95 → auto-link broker.office_id · 70–94 → pending identity match ·
// <70 → unresolved (no write; the dashboard shows the reason). No fabricated
// offices/names/phones. OpenAI is NOT used here (evidence-only, deterministic).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { brokerageRepository } from "./repository";
import { scoreOffice } from "./identity";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { isAcceptableOfficeName } from "./office-name-guard";

export interface OfficeResolutionMetrics {
  brokersDetected: number;
  brokersResolvedToOffice: number;   // office_id set this run (≥95)
  brokersPendingReview: number;      // distinct brokers in a pending office match (70–94)
  brokersUnresolved: number;         // no office evidence
  officesDetected: number;           // existing offices before this run
  officeCandidatesCreated: number;   // offices formed from shared-phone evidence
  officeLinksCreated: number;        // broker→office links written
  matchesCreated: number;            // pending identity matches written
  conflictsCreated: number;
  skippedReason: string | null;
}

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const mostCommon = (xs: string[]): string => {
  const f = new Map<string, number>();
  for (const x of xs) if (x) f.set(x, (f.get(x) ?? 0) + 1);
  return [...f.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

interface Broker { id: string; fullName: string; normalizedName: string | null; primaryPhone: string | null; city: string | null; officeId: string | null }

/** Resolve brokers to offices using real evidence. Returns full metrics. */
export async function resolveBrokerOfficesForOrg(orgId: string): Promise<OfficeResolutionMetrics> {
  const out: OfficeResolutionMetrics = {
    brokersDetected: 0, brokersResolvedToOffice: 0, brokersPendingReview: 0, brokersUnresolved: 0,
    officesDetected: 0, officeCandidatesCreated: 0, officeLinksCreated: 0, matchesCreated: 0,
    conflictsCreated: 0, skippedReason: null,
  };
  const db = createServiceRoleClient();

  const { data: agentRows, error: aErr } = await db.from("brokerage_agents" as never)
    .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,city,office_id").limit(20000);
  if (aErr) { out.skippedReason = `brokerage_agents query failed: ${aErr.message}`; return out; }
  const brokers: Broker[] = ((agentRows ?? []) as Row[]).map((r) => ({
    id: String(r.id), fullName: s(r.full_name), normalizedName: s(r.normalized_name) || null,
    primaryPhone: s(r.primary_phone) || s(r.whatsapp_phone) || null, city: s(r.city) || null,
    officeId: s(r.office_id) || null,
  }));
  out.brokersDetected = brokers.length;
  if (!brokers.length) { out.skippedReason = "no brokers to resolve"; return out; }

  // Existing offices to resolve against.
  const offices = await brokerageRepository.candidateOfficesByCities([]);
  out.officesDetected = offices.length;

  const resolved = new Set<string>();            // brokers with office_id set this run
  const pendingBrokers = new Set<string>();      // brokers in a pending match
  const officeLinkUpdates: { id: string; officeId: string }[] = [];
  const pendingMatches: Row[] = [];
  const newOffices: Row[] = [];
  const nowIso = new Date().toISOString();

  // ── Stage 1: match each broker against EXISTING offices (phone/name/city). ──
  for (const b of brokers) {
    if (b.officeId) { resolved.add(b.id); continue; } // already linked — leave it
    let best: { id: string; score: number; reasons: string[] } | null = null;
    for (const o of offices) {
      const r = scoreOffice({ name: null, phone: b.primaryPhone, office: b.fullName, city: b.city }, o);
      if (r.score > 0 && (!best || r.score > best.score)) best = { id: o.id, score: r.score, reasons: r.reasons };
    }
    if (best && best.score >= 95) { officeLinkUpdates.push({ id: b.id, officeId: best.id }); resolved.add(b.id); }
    else if (best && best.score >= 70) {
      pendingMatches.push(matchRow(b.id, best.id, best.score, best.reasons.map((x) => `משרד קיים: ${x}`)));
      pendingBrokers.add(b.id);
    }
  }

  // ── Stage 2: shared-phone office candidates for still-unresolved brokers. ──
  const byPhone = new Map<string, Broker[]>();
  for (const b of brokers) {
    if (resolved.has(b.id) || pendingBrokers.has(b.id)) continue;
    const np = normalizePhoneNumber(b.primaryPhone ?? "");
    if (!np) continue;
    const arr = byPhone.get(np) ?? [];
    arr.push(b); byPhone.set(np, arr);
  }
  for (const [phone, group] of byPhone) {
    const distinctNames = new Set(group.map((g) => g.normalizedName || normalizeHebrewName(g.fullName)).filter(Boolean));
    if (distinctNames.size < 2) continue; // a single broker on a phone is not office evidence
    const count = distinctNames.size;
    const confidence = count >= 4 ? 96 : count === 3 ? 88 : 80; // stronger with more brokers on one line
    const officeName = mostCommon(group.map((g) => g.fullName)) || s(phone); // real observed name, not invented
    // GUARD (26.13c): a shared phone line is office evidence, but if the only
    // name we have is an individual broker's name (no brand/office keyword) we
    // must NOT create an office from it. Leave the brokers unresolved instead.
    if (!isAcceptableOfficeName(officeName)) continue;
    const officeId = globalThis.crypto.randomUUID();
    const city = mostCommon(group.map((g) => g.city ?? "")) || null;
    newOffices.push({
      id: officeId, name: officeName.trim(), normalized_name: normalizeHebrewName(officeName),
      office_type: "unknown", status: "candidate", city, primary_phone: phone,
      confidence_score: confidence, data_quality_score: 40,
      metadata: { derived_from: "shared_phone_cluster", broker_count: count, org_id: orgId } as never,
      first_seen_at: nowIso, last_seen_at: nowIso,
    });
    out.officeCandidatesCreated++;
    const reasons = [`טלפון משותף ל-${count} מתווכים`];
    if (confidence >= 95) {
      for (const g of group) { officeLinkUpdates.push({ id: g.id, officeId }); resolved.add(g.id); }
    } else {
      for (const g of group) { pendingMatches.push(matchRow(g.id, officeId, confidence, reasons)); pendingBrokers.add(g.id); }
    }
  }

  // ── Writes: offices FIRST (FK target), then broker.office_id, then matches. ──
  for (let i = 0; i < newOffices.length; i += 500) {
    const chunk = newOffices.slice(i, i + 500);
    const { error } = await db.from("brokerage_offices" as never).insert(chunk as never);
    if (error) { out.skippedReason = `brokerage_offices insert failed: ${error.message}`; out.officeCandidatesCreated = Math.min(out.officeCandidatesCreated, i); break; }
  }
  for (const u of officeLinkUpdates) {
    const { error } = await db.from("brokerage_agents" as never).update({ office_id: u.officeId, last_seen_at: nowIso } as never).eq("id", u.id);
    if (!error) out.officeLinksCreated++;
    else if (!out.skippedReason) out.skippedReason = `office_id update failed: ${error.message}`;
  }
  for (let i = 0; i < pendingMatches.length; i += 500) {
    const chunk = pendingMatches.slice(i, i + 500);
    const { error } = await db.from("brokerage_identity_matches" as never).insert(chunk as never);
    if (!error) out.matchesCreated += chunk.length;
  }

  out.brokersResolvedToOffice = out.officeLinksCreated;
  out.brokersPendingReview = pendingBrokers.size;
  out.brokersUnresolved = Math.max(0, out.brokersDetected - resolved.size - pendingBrokers.size);
  if (!out.skippedReason && out.officesDetected === 0 && out.officeCandidatesCreated === 0) {
    out.skippedReason = "no office evidence yet — listing source has no office/agency name; offices form only from shared-phone clusters (≥2 brokers)";
  }
  return out;
}

function matchRow(agentId: string, officeId: string, confidence: number, reasons: string[]): Row {
  return {
    match_type: "agent_to_office", source_entity_type: "agent", source_entity_id: agentId,
    target_entity_type: "office", target_entity_id: officeId,
    confidence_score: confidence, match_reasons: reasons as never, status: "pending_review",
  };
}
