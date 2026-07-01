// ============================================================================
// 🔁 Office Inventory backfill (server-only). Phase 26.5 · Part 7.
// ----------------------------------------------------------------------------
// SAFE relink: for links that carry a broker (agent_id) whose broker has an
// office, write the DERIVED office_id onto the link — but only when the link has
// NO explicit office. A stronger explicit link is never overwritten; a link
// pointing at a DIFFERENT office is logged as a conflict and left untouched. No
// new rows (no duplicates). No schema change (reuses match_reasons evidence).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { type BackfillResult, OFFICE_INVENTORY_VERSION } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const arrOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);

export async function backfillOfficeInventoryFromBrokers(orgId?: string | null, opts: { cap?: number } = {}): Promise<BackfillResult> {
  const db = createServiceRoleClient();
  const cap = opts.cap ?? 5000;
  const notes: string[] = [];

  // Brokers with an office.
  const { data: agentRows } = await db.from("brokerage_agents" as never).select("id,office_id").not("office_id", "is", null).limit(50000);
  const brokerOffice = new Map<string, string>();
  for (const a of (agentRows ?? []) as Row[]) { const id = s(a.id), off = s(a.office_id); if (id && off) brokerOffice.set(id, off); }

  // Links that carry a broker.
  const { data: linkRows } = await db.from("brokerage_external_listing_links" as never)
    .select("id,external_listing_id,agent_id,office_id,match_reasons").not("agent_id", "is", null).limit(50000);
  const links = ((linkRows ?? []) as Row[]).filter((l) => brokerOffice.has(s(l.agent_id)));

  const nowIso = new Date().toISOString();
  let updated = 0, conflicts = 0, skipped = 0, inspected = 0;
  const conflictSamples: BackfillResult["conflictSamples"] = [];

  for (const l of links) {
    if (updated >= cap) { notes.push(`הגעה למכסת ${cap} עדכונים — ניתן להריץ שוב.`); break; }
    inspected++;
    const agentId = s(l.agent_id);
    const brokerOfficeId = brokerOffice.get(agentId)!;
    const linkOfficeId = s(l.office_id);

    if (!linkOfficeId) {
      const reasons = [...new Set([...arrOf(l.match_reasons), "derived_from_broker_office_link", `broker:${agentId}`])];
      const { error } = await db.from("brokerage_external_listing_links" as never)
        .update({ office_id: brokerOfficeId, match_reasons: reasons as never } as never)
        .eq("id", s(l.id)).is("office_id", null);   // guard: only when still null
      if (!error) updated++; else skipped++;
    } else if (linkOfficeId === brokerOfficeId) {
      skipped++;   // already attributed to the broker's office
    } else {
      conflicts++;  // explicit link to a different office — never overwrite
      if (conflictSamples.length < 20) conflictSamples.push({ listingId: s(l.external_listing_id), brokerOfficeId, linkOfficeId });
    }
  }

  void orgId; void nowIso;
  if (conflicts > 0) notes.push(`${conflicts} התנגשויות: המודעה מקושרת למשרד אחר מזה של המתווך — לא נדרסו.`);
  if (updated === 0 && conflicts === 0) notes.push("אין נכסי סוכנים חדשים לשיוך — המלאי מעודכן.");

  return { brokersWithOffice: brokerOffice.size, linksInspected: inspected, linksUpdated: updated, conflicts, skipped, conflictSamples, notes, version: OFFICE_INVENTORY_VERSION };
}
