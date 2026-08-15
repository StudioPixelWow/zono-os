// ============================================================================
// 📊 Directory ≠ Activity — MANDATORY separation (server-only, read-only).
// ----------------------------------------------------------------------------
// DIRECTORY presence (who EXISTS per Madlan) and ZONO-observed ACTIVITY (who is
// currently marketing in our external_listings scans) are DIFFERENT metrics and
// are computed separately. An office can exist in the directory with 0 observed
// listings — that is honest, not an error. "Active" is DERIVED (a join), never a
// mutation of `status`. No fabrication, no market-share/dominance inference.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DIRECTORY_SOURCE } from "./provider";
import { sameCity } from "../normalize";
import { normalizePhoneNumber } from "@/lib/broker/engine";
import type { DirectoryActivitySnapshot } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const cityStem = (c: string): string => c.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? c.trim();

/** Compute directory-presence vs observed-activity for a locality. */
export async function computeDirectoryActivity(locality: string): Promise<DirectoryActivitySnapshot> {
  const db = createServiceRoleClient();
  const stem = cityStem(locality);
  const snap: DirectoryActivitySnapshot = {
    locality: locality.trim(), computedAt: new Date().toISOString(),
    directoryOffices: 0, directoryAgents: 0, directoryRelationships: 0, agentsUnresolved: 0,
    observedActiveOffices: 0, observedActiveAgents: 0, observedListings: 0,
    directorySource: null, directoryLastVerifiedAt: null,
  };

  const [officeRes, agentRes, listingRes] = await Promise.all([
    db.from("brokerage_offices" as never).select("id,city,metadata,last_verified_at,status").ilike("city", `%${stem}%`).limit(20000),
    db.from("brokerage_agents" as never).select("id,city,office_id,primary_phone,whatsapp_phone,metadata,resolution_method").ilike("city", `%${stem}%`).limit(20000),
    db.from("external_listings" as never).select("id,city,contact_phone,status").ilike("city", `%${stem}%`).limit(20000),
  ]);

  const isDir = (meta: unknown, resolution?: unknown): boolean => {
    const m = (meta as Row | null) ?? {};
    return s(m.source) === DIRECTORY_SOURCE || s(resolution) === DIRECTORY_SOURCE;
  };

  const offices = ((officeRes.data ?? []) as Row[]).filter((r) => sameCity(s(r.city), locality));
  const dirOffices = offices.filter((r) => isDir(r.metadata) && s(r.status) !== "rejected");
  snap.directoryOffices = dirOffices.length;
  if (dirOffices.length) {
    snap.directorySource = DIRECTORY_SOURCE;
    snap.directoryLastVerifiedAt = dirOffices
      .map((r) => s(r.last_verified_at)).filter(Boolean).sort().slice(-1)[0] ?? null;
  }

  const agents = ((agentRes.data ?? []) as Row[]).filter((r) => sameCity(s(r.city), locality));
  const dirAgents = agents.filter((r) => isDir(r.metadata, r.resolution_method));
  snap.directoryAgents = dirAgents.length;
  snap.directoryRelationships = dirAgents.filter((r) => !!s(r.office_id)).length;
  snap.agentsUnresolved = dirAgents.filter((r) => !s(r.office_id)).length;

  const listings = ((listingRes.data ?? []) as Row[]).filter((r) => sameCity(s(r.city), locality));
  const activeListings = listings.filter((r) => { const st = s(r.status); return !st || st === "active"; });
  snap.observedListings = activeListings.length;

  // Observed activity = directory identities whose phone appears in ACTIVE
  // listings (honest phone-join; never marks every directory entity active).
  const activePhones = new Set(activeListings.map((r) => normalizePhoneNumber(s(r.contact_phone))).filter(Boolean));
  const activeAgentOffices = new Set<string>();
  let activeAgents = 0;
  for (const a of dirAgents) {
    const phone = normalizePhoneNumber(s(a.primary_phone) || s(a.whatsapp_phone));
    if (phone && activePhones.has(phone)) {
      activeAgents++;
      if (s(a.office_id)) activeAgentOffices.add(s(a.office_id));
    }
  }
  snap.observedActiveAgents = activeAgents;
  snap.observedActiveOffices = activeAgentOffices.size;

  return snap;
}
