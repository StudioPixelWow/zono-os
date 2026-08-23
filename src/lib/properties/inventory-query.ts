// ============================================================================
// ZONO — Properties INVENTORY server-side query (real pagination). Server-only.
// Replaces the old "select('*') → ship the ENTIRE org inventory to the client"
// path. Here the FULL scope is read on the SERVER with a bounded column set (no
// heavy jsonb), KPIs / attention / search / filter / sort / pagination are all
// computed here, and ONLY ONE PAGE of hydrated rows (cover URL + agent + match
// count) is returned to the client. Org boundary = RLS; owner/office scoping =
// explicit SQL. Nothing is fabricated — every signal is a real column fact.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatPropertyPrice, normalizeListingKind } from "@/lib/property/transaction";
import { PROPERTY_STATUS_LABELS, PROPERTY_STATUS_TONES, PROPERTY_TYPE_LABELS } from "./labels";
import { attentionFor, inventoryBrief, isTerminal, sortRows, type Attention, type AttentionKey, type BriefItem, type SortKey } from "./inventory-center";
import { matchesInventoryTab, type InventoryTab } from "./inventory";
import type { BadgeTone } from "@/components/ui/Badge";
import type { ListingKind, PropertyStatus, PropertyType } from "@/lib/supabase/types";

// Bounded column set — everything filtering/sorting/attention/display needs, but
// NOT the heavy jsonb (features/location/marketing_description/ai_description/…).
const SCOPE_COLUMNS =
  "id,title,city,neighborhood,formatted_address,type,listing_kind,status,price,monthly_rent," +
  "rooms,size_sqm,floor,primary_image_url,has_exclusivity,exclusivity_ends_at,updated_at,created_at," +
  "assigned_agent_id,uploaded_by_user_id,office_member_id,ownership_scope,property_origin," +
  "is_office_exclusive,is_agent_exclusive,is_external_inventory,source_type,external_source";

interface ScopeRow {
  id: string; title: string | null; city: string | null; neighborhood: string | null; formatted_address: string | null;
  type: PropertyType; listing_kind: ListingKind | null; status: PropertyStatus;
  price: number | null; monthly_rent: number | null; rooms: number | null; size_sqm: number | null; floor: number | null;
  primary_image_url: string | null; has_exclusivity: boolean | null; exclusivity_ends_at: string | null;
  updated_at: string | null; created_at: string | null;
  assigned_agent_id: string | null; uploaded_by_user_id: string | null; office_member_id: string | null;
  ownership_scope: string; property_origin: string; is_office_exclusive: boolean; is_agent_exclusive: boolean;
  is_external_inventory: boolean; source_type: string; external_source: string | null;
}

export interface InventoryRow {
  id: string; title: string; addressLine: string; city: string | null;
  type: PropertyType; typeLabel: string; listingKind: ListingKind; kindLabel: string;
  status: PropertyStatus; statusLabel: string; statusTone: BadgeTone;
  priceLabel: string; rooms: number | null; sizeSqm: number | null; floor: number | null;
  coverUrl: string | null; hasExclusivity: boolean; exclusivityEndsAt: string | null;
  agent: { id: string; name: string; avatarUrl: string | null } | null;
  matchCount: number; updatedAt: string | null; href: string;
  attention: Attention | null;
}

export interface InventoryKpi { key: "all" | "active" | "attention" | "no_image" | "no_price" | "draft"; label: string; value: number; tone: BadgeTone }
export interface InventoryPage {
  rows: InventoryRow[];
  total: number; page: number; pageSize: number; pageCount: number; rangeStart: number; rangeEnd: number;
  kpis: InventoryKpi[]; brief: BriefItem[];
}

export interface InventoryParams {
  tab?: InventoryTab; q?: string; status?: PropertyStatus | null; type?: PropertyType | null;
  kind?: ListingKind | null; city?: string | null; minPrice?: number | null; maxPrice?: number | null;
  minRooms?: number | null; attention?: AttentionKey | "any" | null; sort?: SortKey; page?: number; pageSize?: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/** The real server-paginated inventory page. Client receives only `rows` (one page). */
export async function queryInventory(params: InventoryParams, currentUserId: string | null): Promise<InventoryPage> {
  const page = Math.max(1, Math.floor(params.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const tab: InventoryTab = params.tab ?? "mine";
  const sort: SortKey = params.sort ?? "recent";
  const supabase = await createClient();

  // ── 1. Scope fetch (server-side, bounded columns). RLS = org boundary. ──────
  let scopeQ = supabase.from("properties").select(SCOPE_COLUMNS)
    .neq("status", "archived")            // archived is terminal — hidden from the working inventory
    .neq("source_type", "external");      // external market listings live on their own surface
  // Owner/office scoping pushed into SQL (was JS post-fetch before).
  if (tab === "mine" && currentUserId) {
    scopeQ = scopeQ.or(`assigned_agent_id.eq.${currentUserId},uploaded_by_user_id.eq.${currentUserId}`);
  } else if (tab === "office") {
    scopeQ = scopeQ.or("ownership_scope.eq.office,property_origin.eq.office_uploaded,is_office_exclusive.eq.true");
  } else if (tab === "office_exclusive") {
    scopeQ = scopeQ.eq("is_office_exclusive", true);
  } else if (tab === "agent_exclusive") {
    scopeQ = scopeQ.eq("is_agent_exclusive", true);
  }
  const { data, error } = await scopeQ;
  if (error) throw new Error(error.message);
  let scope = (data ?? []) as unknown as ScopeRow[];
  // Belt-and-suspenders: apply the canonical tab predicate too (covers "all"/edge flags).
  scope = scope.filter((r) => matchesInventoryTab({
    source_type: r.source_type, property_origin: r.property_origin, ownership_scope: r.ownership_scope,
    exclusivity_scope: "", external_source: r.external_source, is_internal_inventory: !r.is_external_inventory,
    is_external_inventory: r.is_external_inventory, is_office_exclusive: r.is_office_exclusive,
    is_agent_exclusive: r.is_agent_exclusive, internal_double_side_priority: false,
    assigned_agent_id: r.assigned_agent_id, uploaded_by_user_id: r.uploaded_by_user_id,
  }, tab, currentUserId));

  // ── 2. Cover presence (for attention/KPI) — one light ids query. ────────────
  const scopeIds = scope.map((r) => r.id);
  const imageIds = new Set<string>();
  if (scopeIds.length > 0) {
    const { data: media } = await supabase.from("property_media")
      .select("property_id").eq("type", "image").in("property_id", scopeIds);
    for (const m of (media ?? []) as { property_id: string }[]) imageIds.add(m.property_id);
  }
  const hasCover = (id: string): boolean => {
    const r = scope.find((x) => x.id === id);
    return imageIds.has(id) || !!r?.primary_image_url;
  };
  const nowMs = Date.now();

  // ── 3. KPIs + brief across the FULL scope (real counts). ────────────────────
  let active = 0, noImage = 0, noPrice = 0, drafts = 0, needsAttention = 0;
  const attentionById = new Map<string, Attention | null>();
  for (const r of scope) {
    const a = attentionFor(r, hasCover(r.id), nowMs);
    attentionById.set(r.id, a);
    if (r.status === "draft") drafts++;
    if (!isTerminal(r.status)) {
      active++;
      if (a) needsAttention++;
      if (a?.key === "no_image") noImage++;
      if (a?.key === "no_price") noPrice++;
    }
  }
  const kpis: InventoryKpi[] = [
    { key: "all", label: "כל הנכסים", value: scope.length, tone: "neutral" },
    { key: "active", label: "פעילים", value: active, tone: "success" },
    { key: "attention", label: "דורשים טיפול", value: needsAttention, tone: "danger" },
    { key: "no_image", label: "ללא תמונה", value: noImage, tone: "warning" },
    { key: "no_price", label: "ללא מחיר", value: noPrice, tone: "warning" },
    { key: "draft", label: "טיוטות", value: drafts, tone: "neutral" },
  ];
  const brief = inventoryBrief(scope, hasCover, nowMs);

  // ── 4. Search + column filters + attention filter (server-side). ────────────
  const q = params.q ? norm(params.q) : "";
  let filtered = scope.filter((r) => {
    if (q) {
      const hay = `${r.title ?? ""} ${r.city ?? ""} ${r.neighborhood ?? ""} ${r.formatted_address ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (params.status && r.status !== params.status) return false;
    if (params.type && r.type !== params.type) return false;
    if (params.kind && normalizeListingKind(r.listing_kind) !== params.kind) return false;
    if (params.city && !norm(r.city ?? "").includes(norm(params.city))) return false;
    const priceVal = normalizeListingKind(r.listing_kind) === "rent" ? (r.monthly_rent ?? 0) : (r.price ?? 0);
    if (params.minPrice != null && priceVal < params.minPrice) return false;
    if (params.maxPrice != null && priceVal > params.maxPrice) return false;
    if (params.minRooms != null && (r.rooms ?? 0) < params.minRooms) return false;
    if (params.attention === "any") { if (!attentionById.get(r.id)) return false; }
    else if (params.attention && attentionById.get(r.id)?.key !== params.attention) return false;
    return true;
  });

  // ── 5. Sort + real (non-cumulative) pagination. ─────────────────────────────
  filtered = sortRows(filtered, sort, hasCover, nowMs);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const pageIds = pageRows.map((r) => r.id);

  // ── 6. Hydrate the PAGE only: cover URLs, agents, match counts. ─────────────
  const coverUrl = new Map<string, string>();
  const agentInfo = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  const matchCount = new Map<string, number>();
  if (pageIds.length > 0) {
    const [{ data: covers }, agentIds] = await Promise.all([
      supabase.from("property_media").select("property_id,url,is_primary,sort_order")
        .eq("type", "image").in("property_id", pageIds)
        .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }),
      Promise.resolve(Array.from(new Set(pageRows.map((r) => r.assigned_agent_id).filter(Boolean))) as string[]),
    ]);
    for (const m of (covers ?? []) as { property_id: string; url: string | null }[]) {
      if (m.url && !coverUrl.has(m.property_id)) coverUrl.set(m.property_id, m.url);
    }
    if (agentIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id,full_name,avatar_url").in("id", agentIds);
      for (const u of (users ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
        agentInfo.set(u.id, { id: u.id, name: u.full_name || "סוכן", avatarUrl: u.avatar_url });
      }
    }
    const { data: matches } = await supabase.from("match_intelligence_profiles")
      .select("property_id").eq("match_status", "active").in("property_id", pageIds);
    for (const m of (matches ?? []) as { property_id: string }[]) {
      matchCount.set(m.property_id, (matchCount.get(m.property_id) ?? 0) + 1);
    }
  }

  const rows: InventoryRow[] = pageRows.map((r) => {
    const kind = normalizeListingKind(r.listing_kind) ?? "sale";
    return {
      id: r.id,
      title: (r.title || "").trim() || r.neighborhood || r.city || "נכס",
      addressLine: r.formatted_address || [r.neighborhood, r.city].filter(Boolean).join(", ") || "—",
      city: r.city,
      type: r.type, typeLabel: PROPERTY_TYPE_LABELS[r.type] ?? "נכס",
      listingKind: kind, kindLabel: kind === "rent" ? "השכרה" : "מכירה",
      status: r.status, statusLabel: PROPERTY_STATUS_LABELS[r.status] ?? r.status, statusTone: PROPERTY_STATUS_TONES[r.status] ?? "neutral",
      priceLabel: formatPropertyPrice({ kind, price: r.price, monthlyRent: r.monthly_rent }),
      rooms: r.rooms, sizeSqm: r.size_sqm, floor: r.floor,
      coverUrl: coverUrl.get(r.id) ?? r.primary_image_url ?? null,
      hasExclusivity: !!r.has_exclusivity, exclusivityEndsAt: r.exclusivity_ends_at,
      agent: r.assigned_agent_id ? (agentInfo.get(r.assigned_agent_id) ?? null) : null,
      matchCount: matchCount.get(r.id) ?? 0, updatedAt: r.updated_at,
      href: `/properties/${r.id}`,
      attention: attentionById.get(r.id) ?? null,
    };
  });

  return {
    rows, total, page: safePage, pageSize, pageCount,
    rangeStart: total === 0 ? 0 : start + 1, rangeEnd: start + pageRows.length,
    kpis, brief,
  };
}
