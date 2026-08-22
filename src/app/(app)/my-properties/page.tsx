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

  return (
    <PropertiesOSView properties={rows} agentName={agentName} covers={covers}>
      <div className="flex flex-col gap-6">
        <WorkspaceLinks links={WORKSPACE_LINKS} />
        <PropertiesListView
          properties={rows} filters={filters} error={error} currentUserId={currentUserId} covers={covers}
          eyebrow="🏠 הנכסים שלי" title="כל הנכסים" initialAttention={initialAttention}
        />
      </div>
    </PropertiesOSView>
  );
}
