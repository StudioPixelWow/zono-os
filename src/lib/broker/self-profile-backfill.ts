// ============================================================================
// ZONO — SELF broker-profile backfill (server-only, idempotent, NON-destructive).
// New signups seed a self broker_profile at onboarding; this brings EXISTING orgs
// up to the same state so their owners get the claim moment too. It creates a
// self-identity profile (metadata.self=true, created_by_user_id) from the user's
// own identity, confidence-gated — and NEVER promotes a competitor profile to
// "self". Ambiguous cases are marked needs_confirmation, never auto-verified.
// Safe to run repeatedly (skips users who already have a self profile).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeHebrewName } from "@/lib/broker/engine";
import { normalizePhoneIL } from "@/lib/util/identity";

export type SelfConfidence = "verified" | "high" | "needs_confirmation";

export interface SelfBackfillReport {
  dryRun: boolean; users: number; eligible: number; created: number;
  existing: number; ambiguous: number; skipped: number; byConfidence: Record<SelfConfidence, number>;
}

export async function backfillSelfProfiles(opts: { dryRun?: boolean } = {}): Promise<SelfBackfillReport> {
  const dryRun = opts.dryRun ?? false;
  const db = createServiceRoleClient();
  const rep: SelfBackfillReport = { dryRun, users: 0, eligible: 0, created: 0, existing: 0, ambiguous: 0, skipped: 0, byConfidence: { verified: 0, high: 0, needs_confirmation: 0 } };

  const { data: users } = await (db.from("users" as never)
    .select("id,org_id,full_name,email,phone,operating_city,primary_city,onboarding_completed")
    .not("org_id", "is", null) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>);
  const rows = users ?? [];
  rep.users = rows.length;

  // Existing self profiles (by created_by_user_id) — skip those users.
  const { data: selfRows } = await (db.from("broker_profiles" as never)
    .select("created_by_user_id").not("created_by_user_id", "is", null) as unknown as Promise<{ data: Array<{ created_by_user_id: string }> | null }>);
  const haveSelf = new Set((selfRows ?? []).map((r) => r.created_by_user_id));

  for (const u of rows) {
    const userId = String(u.id); const orgId = String(u.org_id);
    const name = ((u.full_name as string | null) ?? "").trim();
    if (!name) { rep.skipped++; continue; }
    if (haveSelf.has(userId)) { rep.existing++; continue; }
    rep.eligible++;

    const phone = normalizePhoneIL((u.phone as string | null) ?? "");
    const email = ((u.email as string | null) ?? "").trim().toLowerCase();
    const normName = normalizeHebrewName(name);
    const city = ((u.operating_city as string | null) ?? (u.primary_city as string | null) ?? null);

    // Ambiguity: a competitor profile in the same org already carries this name
    // (not created by this user) → do NOT auto-verify; mark needs_confirmation.
    const { data: sameName } = await (db.from("broker_profiles" as never)
      .select("id,created_by_user_id").eq("org_id", orgId).eq("normalized_name", normName).limit(5) as unknown as Promise<{ data: Array<{ id: string; created_by_user_id: string | null }> | null }>);
    const competitorCollision = (sameName ?? []).some((p) => p.created_by_user_id !== userId);

    let confidence: SelfConfidence;
    if (competitorCollision) confidence = "needs_confirmation";
    else if (phone) confidence = "verified";          // phone is a unique self signal
    else if (city) confidence = "high";               // name + activity city
    else confidence = "needs_confirmation";           // name only → not auto-verified
    if (confidence === "needs_confirmation") rep.ambiguous++;
    rep.byConfidence[confidence]++;

    if (!dryRun) {
      // verification_status is the DB enum {unverified, auto, human_verified,
      // rejected}. A backfilled self-profile is SYSTEM-derived, so a confident
      // (phone / name+city) match maps to "auto"; anything needing the owner's
      // confirmation stays "unverified". The finer self-confidence
      // (verified / high / needs_confirmation) is preserved in metadata.confidence,
      // and the claim flow is where a human promotes it to human_verified.
      const dbStatus = confidence === "needs_confirmation" ? "unverified" : "auto";
      await db.from("broker_profiles" as never).insert({
        org_id: orgId, display_name: name, normalized_name: normName,
        phone: (u.phone as string | null) ?? null, normalized_phone: phone || null,
        email: email || null, primary_city: city, broker_type: "independent_broker",
        verification_status: dbStatus,
        created_by_user_id: userId, verified_by_user_id: null, verified_at: null,
        metadata: { self: true, source: "backfill", confidence } as never,
      } as never).then(() => { rep.created++; }, () => { rep.skipped++; });
    }
  }
  return rep;
}
