// ============================================================================
// ZONO — Deal-stage hover preview: SERVER selector (server-only, RLS + org-scoped).
// Bounded retrieval ONLY — reuses the canonical deal projection (deal_profiles),
// the canonical property fields and the canonical agent-avatar resolver. No new
// deal/stage/attribution logic. Returns at most PREVIEW_MAX real deals for ONE
// validated stage, plus stage-entry timing from deal_journeys (honest, bounded).
// A foreign-org deal can never appear (explicit organization_id filter + RLS).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveAgentAvatar } from "@/lib/office/avatar";
import {
  isPreviewStageKey, boundPreviewItems, daysSince, stageLabelHe,
  type DealStagePreview, type DealPreviewItem,
} from "./deal-stage-preview-core";

// Read a generous-but-bounded window so `total` reflects "several" without an
// unbounded scan; only PREVIEW_MAX are hydrated + returned.
const STAGE_SCAN_CAP = 30;

interface ProfRow {
  id: string; property_id: string | null; assigned_agent_id: string | null;
  deal_value: number | null; next_best_action: string | null; primary_blocker: string | null; locality: string | null;
}
interface PropRow { id: string; title: string | null; primary_image_url: string | null; neighborhood: string | null; city: string | null; price: number | null }
interface UserRow { id: string; full_name: string | null; avatar_url: string | null }

/** Bounded, org-scoped preview of the deals currently in ONE stage. null when the
 *  stage is invalid, the session has no org, or the query fails (caller shows a
 *  calm state — never fabricated rows). */
export async function getDealStagePreview(stageKey: string): Promise<DealStagePreview | null> {
  // Never trust a client-supplied stage.
  if (!isPreviewStageKey(stageKey)) return null;

  let orgId: string | null = null;
  try { orgId = (await getSessionContext()).profile?.org_id ?? null; } catch { return null; }
  if (!orgId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_profiles")
    .select("id,property_id,assigned_agent_id,deal_value,next_best_action,primary_blocker,locality")
    .eq("organization_id", orgId)          // explicit org scope (defense in depth over RLS)
    .eq("status", "active")
    .eq("deal_stage", stageKey)            // validated stage only
    .order("deal_value", { ascending: false })
    .limit(STAGE_SCAN_CAP);
  if (error) return null;

  const rows = (data ?? []) as ProfRow[];
  const total = rows.length;
  const top = boundPreviewItems(rows);
  if (top.length === 0) return { stage: stageKey, stageLabel: stageLabelHe(stageKey), total: 0, items: [] };

  const propIds = [...new Set(top.map((r) => r.property_id).filter((x): x is string => !!x))];
  const agentIds = [...new Set(top.map((r) => r.assigned_agent_id).filter((x): x is string => !!x))];
  const dealIds = top.map((r) => r.id);

  const [propsR, usersR, journeysR] = await Promise.all([
    propIds.length ? supabase.from("properties").select("id,title,primary_image_url,neighborhood,city,price").in("id", propIds)
      : Promise.resolve({ data: [] as PropRow[] }),
    agentIds.length ? supabase.from("users").select("id,full_name,avatar_url").in("id", agentIds)
      : Promise.resolve({ data: [] as UserRow[] }),
    // Latest stage transition per deal → honest "time in stage" (one bounded query).
    supabase.from("deal_journeys").select("deal_profile_id,created_at").in("deal_profile_id", dealIds).order("created_at", { ascending: false }),
  ]);

  const propMap = new Map(((propsR.data ?? []) as PropRow[]).map((p) => [p.id, p]));
  const userMap = new Map(((usersR.data ?? []) as UserRow[]).map((u) => [u.id, u]));
  const lastJourney = new Map<string, string>();
  for (const j of ((journeysR.data ?? []) as { deal_profile_id: string; created_at: string }[])) {
    if (!lastJourney.has(j.deal_profile_id)) lastJourney.set(j.deal_profile_id, j.created_at); // first = latest (desc)
  }

  const now = Date.now();
  const items: DealPreviewItem[] = top.map((r) => {
    const p = r.property_id ? propMap.get(r.property_id) ?? null : null;
    const u = r.assigned_agent_id ? userMap.get(r.assigned_agent_id) ?? null : null;
    const area = p ? ([p.neighborhood, p.city].filter(Boolean).join(", ") || null) : (r.locality ?? null);
    return {
      id: r.id,
      propertyTitle: (p?.title ?? "").trim() || "נכס",
      area,
      price: (typeof p?.price === "number" ? p.price : null) ?? (r.deal_value || null),
      image: p?.primary_image_url ?? null,
      agentName: (u?.full_name ?? "").trim() || null,
      agentPhoto: resolveAgentAvatar({ avatarUrl: u?.avatar_url ?? null, linkedUserAvatarUrl: null }),
      daysInStage: daysSince(lastJourney.get(r.id) ?? null, now),
      detail: (r.next_best_action ?? r.primary_blocker ?? "").trim() || null,
    };
  });

  return { stage: stageKey, stageLabel: stageLabelHe(stageKey), total, items };
}
