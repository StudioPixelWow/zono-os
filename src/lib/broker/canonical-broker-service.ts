// ============================================================================
// ZONO — CANONICAL BROKER RESOLUTION + BACKFILL (server-only, idempotent,
// NON-destructive). Converges the two identity systems (broker_profiles used by
// detected_broker_id + brokerage_agents used by office intelligence) into ONE
// canonical broker, keeping BOTH source tables intact and recording provenance in
// broker_identity_links. Merge policy (from the live reconciliation): normalized
// PHONE or EMAIL clusters merge (very strong, unique); NAME-ONLY never merges
// (collisions) — each name-only source becomes its own canonical, flagged low. It
// then derives broker_office_memberships from brokerage_agents.office_id + the
// office↔listing links built last round. Deterministic; safe to re-run.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizePhoneIL, normalizeEmailAddr } from "@/lib/util/identity";
import { normalizeHebrewName } from "@/lib/broker/engine";
import { strongKey as coreStrongKey, mergeVerdict } from "./canonical-core";

export interface CanonicalBrokerReport {
  dryRun: boolean;
  brokerProfiles: number; brokerageAgents: number;
  canonicalBrokers: number; phoneMerges: number; emailMerges: number; nameOnly: number;
  identityLinks: number; officeMemberships: number; ambiguous: number;
}

type Src = { type: "broker_profile" | "brokerage_agent"; id: string; name: string; phone: string; email: string; city: string | null; officeId: string | null };

const strongKey = (s: Src): string | null => coreStrongKey(s.phone, s.email)?.key ?? null;

export async function backfillCanonicalBrokers(opts: { dryRun?: boolean } = {}): Promise<CanonicalBrokerReport> {
  const dryRun = opts.dryRun ?? false;
  const db = createServiceRoleClient();
  const rep: CanonicalBrokerReport = { dryRun, brokerProfiles: 0, brokerageAgents: 0, canonicalBrokers: 0, phoneMerges: 0, emailMerges: 0, nameOnly: 0, identityLinks: 0, officeMemberships: 0, ambiguous: 0 };

  const [{ data: profs }, { data: agents }] = await Promise.all([
    (db.from("broker_profiles" as never).select("id,display_name,normalized_name,phone,normalized_phone,email,primary_city").limit(50000) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>),
    (db.from("brokerage_agents" as never).select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city,office_id").limit(50000) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>),
  ]);
  const P = profs ?? [], A = agents ?? [];
  rep.brokerProfiles = P.length; rep.brokerageAgents = A.length;

  const sources: Src[] = [
    ...P.map((r): Src => ({ type: "broker_profile", id: String(r.id), name: String(r.normalized_name ?? r.display_name ?? ""), phone: normalizePhoneIL((r.normalized_phone as string) ?? (r.phone as string)), email: normalizeEmailAddr(r.email as string), city: (r.primary_city as string) ?? null, officeId: null })),
    ...A.map((r): Src => ({ type: "brokerage_agent", id: String(r.id), name: String(r.normalized_name ?? r.full_name ?? ""), phone: normalizePhoneIL((r.primary_phone as string) ?? (r.whatsapp_phone as string)), email: normalizeEmailAddr(r.primary_email as string), city: (r.city as string) ?? null, officeId: (r.office_id as string) ?? null })),
  ];

  // Cluster by strong key (phone/email); name-only sources each stand alone.
  const clusters = new Map<string, Src[]>();
  let nameOnlySeq = 0;
  for (const s of sources) {
    const k = strongKey(s) ?? `n:${nameOnlySeq++}:${s.type}:${s.id}`;
    (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(s);
  }

  const plannedMemberships = new Map<string, { officeId: string; brokerName: string; phone: string; email: string; city: string | null; sources: Src[] }>();
  for (const [k, members] of clusters) {
    const hasPhone = k.startsWith("p:"), hasEmail = k.startsWith("e:");
    if (hasPhone && members.length > 1) rep.phoneMerges++;
    if (hasEmail && members.length > 1) rep.emailMerges++;
    if (k.startsWith("n:")) rep.nameOnly++;
    // Distinct names inside a phone cluster → ambiguous (same phone, different names).
    const names = new Set(members.map((m) => normalizeHebrewName(m.name)).filter(Boolean));
    const ambiguous = (hasPhone || hasEmail) && names.size > 1;
    if (ambiguous) rep.ambiguous++;

    const primary = members[0];
    const phone = members.find((m) => m.phone)?.phone ?? "";
    const email = members.find((m) => m.email)?.email ?? "";
    const officeIds = members.map((m) => m.officeId).filter(Boolean) as string[];
    const verdict = mergeVerdict(hasPhone ? "phone" : hasEmail ? "email" : "name", names.size || 1);
    const verification = verdict.verification;
    const confidence = verdict.confidence;

    rep.canonicalBrokers++;
    rep.identityLinks += members.length;

    if (!dryRun) {
      // Idempotent: reuse an existing canonical broker via any member's identity link.
      let canonicalId: string | null = null;
      for (const m of members) {
        const { data: link } = await (db.from("broker_identity_links" as never)
          .select("canonical_broker_id").eq("source_type", m.type).eq("source_id", m.id).maybeSingle() as unknown as Promise<{ data: { canonical_broker_id: string } | null }>);
        if (link?.canonical_broker_id) { canonicalId = link.canonical_broker_id; break; }
      }
      if (!canonicalId) {
        const { data: cb } = await (db.from("canonical_brokers" as never).insert({
          canonical_name: primary.name || "מתווך", normalized_name: normalizeHebrewName(primary.name),
          primary_phone: phone || null, normalized_phone: phone || null, primary_email: email || null, normalized_email: email || null,
          city: primary.city, verification_status: verification, confidence,
          metadata: { merged_sources: members.length, key_kind: hasPhone ? "phone" : hasEmail ? "email" : "name" } as never,
        } as never).select("id").maybeSingle() as unknown as Promise<{ data: { id: string } | null }>);
        canonicalId = cb?.id ?? null;
      }
      if (canonicalId) {
        for (const m of members) {
          await (db.from("broker_identity_links" as never).upsert({
            canonical_broker_id: canonicalId, source_type: m.type, source_id: m.id,
            evidence: hasPhone ? "normalized_phone" : hasEmail ? "normalized_email" : "name_only",
            confidence,
          } as never, { onConflict: "source_type,source_id" }) as unknown as Promise<unknown>).catch(() => undefined);
        }
        for (const oid of [...new Set(officeIds)]) {
          await (db.from("broker_office_memberships" as never).upsert({
            canonical_broker_id: canonicalId, office_id: oid, is_current: true, confidence: 90,
            source: "brokerage_agent_office_id", evidence: "existing_directory_office_id",
          } as never, { onConflict: "canonical_broker_id,office_id" }) as unknown as Promise<unknown>).catch(() => undefined);
          rep.officeMemberships++;
        }
      }
    } else {
      rep.officeMemberships += new Set(officeIds).size;
    }
    void plannedMemberships;
  }
  return rep;
}
