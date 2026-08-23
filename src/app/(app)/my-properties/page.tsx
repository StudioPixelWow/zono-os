// ============================================================================
// 🏠 הנכסים שלי — My Properties workspace (personal CRM ONLY).
// ----------------------------------------------------------------------------
// One of three independent workspaces. Shows the agent's OWN inventory only —
// never office-wide listings, never external market listings. Reuses the
// existing PropertiesOSView + PropertiesListView and the existing personal
// filter (matchesInventoryTab "mine"). Presentation reorg only — no new logic,
// no new data, no engine changes.
// ============================================================================
import { listProperties, listPropertyCovers, type PropertyRow } from "@/lib/properties/repository";
import { matchesInventoryTab } from "@/lib/properties/inventory";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { PropertyStatus, PropertyType } from "@/lib/supabase/types";
import { PropertiesListView } from "../properties/PropertiesListView";
import { PropertiesOSView } from "../properties/PropertiesOSView";
import { WorkspaceLinks, type WorkspaceLink } from "@/components/workspace/WorkspaceHeader";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | undefined => { if (!v) return undefined; const n = Number(v); return Number.isNaN(n) ? undefined : n; };

// Phase 26.7.1 — obvious jumps to the other two workspaces + the external market.
const WORKSPACE_LINKS: WorkspaceLink[] = [
  { href: "/office-inventory", emoji: "🏢", label: "מלאי המשרד", hint: "Office Inventory" },
  { href: "/market-intelligence/dashboard", emoji: "🌍", label: "מודיעין שוק", hint: "Market Intelligence" },
  { href: "/market-intelligence", emoji: "📡", label: "נכסים חיצוניים", hint: "External Listings" },
];

export default async function MyPropertiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const filters = {
    city: str("city"), type: str("type") as PropertyType | undefined, status: str("status") as PropertyStatus | undefined,
    minPrice: num(str("minPrice")), maxPrice: num(str("maxPrice")), minRooms: num(str("minRooms")), maxRooms: num(str("maxRooms")),
  };

  const { user, profile } = await getSessionContext();
  const currentUserId = user?.id ?? null;
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";
  const ATTENTION_KEYS = ["no_image", "no_price", "unpublished", "missing_details", "stale"] as const;
  const attRaw = str("attention");
  const initialAttention = (ATTENTION_KEYS as readonly string[]).includes(attRaw ?? "") ? (attRaw as (typeof ATTENTION_KEYS)[number]) : null;

  let rows: PropertyRow[] = [];
  let error = false;
  try { rows = await listProperties(filters); } catch (e) { console.error("[my-properties] list failed:", e); error = true; }
  // Personal CRM only: my assigned/uploaded inventory, never external.
  rows = rows.filter((r) => matchesInventoryTab(r, "mine", currentUserId) && r.source_type !== "external");

  let covers: Record<string, string> = {};
  try { covers = await listPropertyCovers(rows.map((r) => r.id)); } catch (e) { console.error("[my-properties] covers failed:", e); }

  // Agent attribution + matched-buyer counts — TWO bounded aggregate queries over
  // the properties in view (never per-property; no N+1). Powers the responsible-
  // agent avatar on every card and the "עם קונים מתאימים" summary/filter.
  const agents: Record<string, { name: string; avatarUrl: string | null }> = {};
  const matchCounts: Record<string, number> = {};
  try {
    const sb = await createClient();
    const propertyIds = rows.map((r) => r.id);
    const agentIds = [...new Set(rows.map((r) => (r as { assigned_agent_id?: string | null }).assigned_agent_id).filter(Boolean))] as string[];
    if (agentIds.length) {
      const { data: us } = await sb.from("users").select("id,full_name,avatar_url").in("id", agentIds);
      const byId = new Map(((us ?? []) as { id: string; full_name: string; avatar_url: string | null }[]).map((u) => [u.id, u]));
      for (const r of rows) {
        const aid = (r as { assigned_agent_id?: string | null }).assigned_agent_id;
        const u = aid ? byId.get(aid) : null;
        if (u) agents[r.id] = { name: u.full_name, avatarUrl: u.avatar_url };
      }
    }
    if (propertyIds.length) {
      const { data: ms } = await sb.from("match_intelligence_profiles").select("property_id").in("property_id", propertyIds).eq("match_status", "active");
      for (const m of (ms ?? []) as { property_id: string }[]) matchCounts[m.property_id] = (matchCounts[m.property_id] ?? 0) + 1;
    }
  } catch (e) { console.error("[my-properties] agent/match load failed:", e); }

  return (
    <PropertiesOSView properties={rows} agentName={agentName} covers={covers} agents={agents} matchCounts={matchCounts}>
      <div className="flex flex-col gap-6">
        <WorkspaceLinks links={WORKSPACE_LINKS} />
        <PropertiesListView
          properties={rows} filters={filters} error={error} currentUserId={currentUserId} covers={covers}
          agents={agents} matchCounts={matchCounts}
          eyebrow="🏠 הנכסים שלי" title="כל הנכסים" initialAttention={initialAttention}
        />
      </div>
    </PropertiesOSView>
  );
}
