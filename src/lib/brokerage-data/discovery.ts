// ============================================================================
// 🔎 Brokerage discovery — lawful "publisher" discovery (Phase 26.9.6 deferred).
// Derives broker/agent candidates ONLY from public listing data ZONO already
// ingested (external_listings published by agents). No web scraping, no Apify,
// no third-party calls — this is the codebase-sanctioned `listing_publishers`
// provider. New brokers are persisted as status="candidate" (never verified) and
// deduped against existing brokerage_agents. Records a discovery refresh run.
// Service-role; gate callers at the app layer (owner/admin). No-throw.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeHebrewName, normalizePhoneNumber, normalizeCity } from "./normalize";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface DiscoveryResult {
  ran: boolean;
  scanned: number;          // broker-published listings examined
  candidatesFound: number;  // distinct publisher identities
  newAgents: number;        // newly persisted candidate brokers
  skippedExisting: number;  // matched an existing broker → not re-created
  runId: string | null;
  message: string;
}

interface Candidate {
  displayName: string;
  normalizedName: string;
  phone: string | null;
  normalizedPhone: string;
  cities: Set<string>;
  sources: Set<string>;
  count: number;
}

/**
 * Discover broker/agent publishers from an org's already-ingested external
 * listings. Lawful & deterministic — derives identities from public listing
 * contact data only; never scrapes the web. Idempotent: existing brokers are
 * skipped, so re-running only adds genuinely new candidates.
 */
export async function discoverBrokeragePublishers(orgId: string, userId: string | null): Promise<DiscoveryResult> {
  const db = createServiceRoleClient();

  // Open a discovery run row up-front (so it never stays invisible).
  let runId: string | null = null;
  try {
    const { data: run } = await db.from("brokerage_refresh_runs" as never).insert({
      run_type: "discovery", status: "running", requested_by: userId,
      started_at: new Date().toISOString(),
      parameters: { provider: "listing_publishers", org_id: orgId } as never,
    } as never).select("id").maybeSingle();
    runId = run ? String((run as Row).id) : null;
  } catch { /* best-effort audit only */ }

  try {
    // Only broker-published listings (has_agent) with a usable contact.
    const { data: rows } = await db
      .from("external_listings" as never)
      .select("contact_name,contact_phone,contact_type,city,source,has_agent")
      .eq("org_id", orgId).eq("status", "active").eq("has_agent", true)
      .limit(5000);
    const listings = (rows ?? []) as Row[];
    const scanned = listings.length;

    // Group into distinct publisher identities (by normalized phone, else name).
    const byKey = new Map<string, Candidate>();
    for (const r of listings) {
      const name = str(r.contact_name).trim();
      const phone = str(r.contact_phone).trim() || null;
      const normalizedName = normalizeHebrewName(name);
      const normalizedPhone = phone ? normalizePhoneNumber(phone) : "";
      const key = normalizedPhone || normalizedName;
      if (!key || (!normalizedName && !normalizedPhone)) continue;       // skip empties
      if (!normalizedName && !phone) continue;
      let c = byKey.get(key);
      if (!c) {
        c = { displayName: name || phone || "", normalizedName, phone, normalizedPhone, cities: new Set(), sources: new Set(), count: 0 };
        byKey.set(key, c);
      }
      if (!c.displayName && name) c.displayName = name;
      if (!c.phone && phone) { c.phone = phone; c.normalizedPhone = normalizedPhone; }
      const city = str(r.city).trim();
      if (city) c.cities.add(city);
      const source = str(r.source).trim();
      if (source) c.sources.add(source);
      c.count++;
    }
    const candidates = [...byKey.values()].filter((c) => c.displayName.trim().length > 1);

    // Existing brokers → dedupe sets (normalized phone + name).
    const { data: existing } = await db.from("brokerage_agents" as never)
      .select("normalized_name,primary_phone,whatsapp_phone").limit(20000);
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();
    for (const e of (existing ?? []) as Row[]) {
      const np = normalizePhoneNumber(str(e.primary_phone));
      const nw = normalizePhoneNumber(str(e.whatsapp_phone));
      if (np) existingPhones.add(np);
      if (nw) existingPhones.add(nw);
      const nn = str(e.normalized_name);
      if (nn) existingNames.add(nn);
    }

    let newAgents = 0;
    let skippedExisting = 0;
    for (const c of candidates) {
      const dupByPhone = c.normalizedPhone && existingPhones.has(c.normalizedPhone);
      const dupByName = !c.normalizedPhone && c.normalizedName && existingNames.has(c.normalizedName);
      if (dupByPhone || dupByName) { skippedExisting++; continue; }

      const city = [...c.cities][0] ?? null;
      const confidence = Math.min(60, 35 + (c.phone ? 10 : 0) + Math.min(10, (c.count - 1) * 2));
      const dataQuality = Math.min(70, 30 + (c.phone ? 25 : 0) + (city ? 15 : 0));
      try {
        await db.from("brokerage_agents" as never).insert({
          full_name: c.displayName.trim(), normalized_name: c.normalizedName || normalizeHebrewName(c.displayName),
          status: "candidate", city, primary_phone: c.phone, specialties: [] as never,
          confidence_score: confidence, data_quality_score: dataQuality,
          metadata: { discovered_via: "listing_publishers", org_id: orgId, listings_seen: c.count,
            cities: [...c.cities].map(normalizeCity), sources: [...c.sources] } as never,
          first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
        } as never);
        newAgents++;
        // Track within-run so two candidates with the same identity aren't double-inserted.
        if (c.normalizedPhone) existingPhones.add(c.normalizedPhone); else if (c.normalizedName) existingNames.add(c.normalizedName);
      } catch (e) { console.error("[brokerage-discovery] insert failed:", e); }
    }

    if (runId) {
      await db.from("brokerage_refresh_runs" as never).update({
        status: "completed", finished_at: new Date().toISOString(),
        agents_found: candidates.length, new_agents: newAgents, updated_records: newAgents, errors_count: 0,
        log: [{ provider: "listing_publishers", scanned, candidates: candidates.length, newAgents, skippedExisting }] as never,
      } as never).eq("id", runId);
    }

    return {
      ran: true, scanned, candidatesFound: candidates.length, newAgents, skippedExisting, runId,
      message: newAgents > 0
        ? `זוהו ${newAgents} מתווכים חדשים מתוך ${candidates.length} מפרסמים (${scanned} מודעות).`
        : candidates.length > 0
          ? `כל ${candidates.length} המפרסמים כבר קיימים במאגר.`
          : "לא נמצאו מודעות שפורסמו על ידי מתווכים לגילוי.",
    };
  } catch (e) {
    console.error("[brokerage-discovery] failed:", e);
    if (runId) {
      try {
        await db.from("brokerage_refresh_runs" as never).update({
          status: "failed", finished_at: new Date().toISOString(), errors_count: 1,
        } as never).eq("id", runId);
      } catch { /* ignore */ }
    }
    return { ran: false, scanned: 0, candidatesFound: 0, newAgents: 0, skippedExisting: 0, runId, message: "הגילוי נכשל. נסה שוב בעוד רגע." };
  }
}
