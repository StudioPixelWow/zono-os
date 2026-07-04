// ============================================================================
// 🎯 ZONO — Property Marketing Action Center — service (server-only). 33.3.
// Builds the actionable state for a property by REUSING existing sources: the
// Property Marketing Log (summary), the distribution posts queue (due-now +
// failed) and community_comments (pending lead suggestions), plus the Facebook
// connection status from the manual-publish provider. Read-only; no new tables;
// nothing executes — the pure engine turns it into approval-gated action items.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getPropertyMarketingLog } from "@/lib/property-marketing-log";
import { manualPublishService } from "@/lib/distribution/manual-publish-service";
import { buildActionCenter, type ActionCenter } from "./actions";

type Row = Record<string, unknown>;
const num = (v: unknown): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const DUE_STATUSES = ["scheduled", "queued", "pending"];
const LEAD_INTENTS = ["asks_for_price", "asks_for_details", "asks_for_location", "asks_for_photos", "asks_for_phone", "asks_for_viewing", "interested"];

export async function getPropertyMarketingActionCenter(propertyId: string): Promise<ActionCenter> {
  const base = { campaigns: 0, scheduled: 0, dueNow: 0, published: 0, failed: 0, comments: 0, leads: 0, pendingLeads: 0, creatives: 0, connected: false };
  if (!propertyId) return buildActionCenter(base);

  const db = await createClient();
  const { organization } = await getSessionContext();
  const orgId = organization?.id ?? "";
  const nowIso = new Date().toISOString();

  const [log, dueR, pendR, conn] = await Promise.all([
    getPropertyMarketingLog(propertyId).catch(() => null),
    // Due-now: scheduled/queued posts whose time has arrived.
    db.from("distribution_posts" as never).select("id,status,scheduled_at").eq("property_id", propertyId).in("status", DUE_STATUSES as never).lte("scheduled_at", nowIso).limit(500),
    // Pending lead suggestions: lead-worthy comments not yet converted.
    db.from("community_comments" as never).select("id,intent,lead_created").eq("property_id", propertyId).eq("lead_created", false).limit(500),
    orgId ? manualPublishService.providerStatus(orgId, "facebook_group").catch(() => null) : Promise.resolve(null),
  ]);

  const s = log?.summary;
  const dueNow = ((dueR.data ?? []) as unknown as Row[]).length;
  const pendingLeads = ((pendR.data ?? []) as unknown as Row[]).filter((c) => LEAD_INTENTS.includes(String(c.intent))).length;
  const connected = !!conn && conn.status !== "not_connected" && conn.status !== "error" && conn.status !== "pending";

  return buildActionCenter({
    campaigns: s?.campaigns ?? 0, scheduled: s?.scheduled ?? 0, dueNow,
    published: s?.published ?? 0, failed: s?.failed ?? 0,
    comments: s?.comments ?? 0, leads: s?.leads ?? 0, pendingLeads,
    creatives: s?.creatives ?? 0, connected,
  });
}

export { num };
