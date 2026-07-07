// ============================================================================
// 🧬 ZONO — Self-Learning AI — service (server-only). PHASE 54.0.
// Harvests REAL OUTCOMES from the existing distribution tables (posts + groups +
// variations) — which copy angle, which group, which hour, which area actually
// produced leads — and feeds the pure detector. No LLM memory as source of truth.
// Read-only; org-scoped via RLS; compute-cache. Output is ADVISORY.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import type { Json } from "@/lib/supabase/types";
import { learnPatterns } from "./learn";
import { SELF_LEARNING_VERSION } from "./types";
import type { LearningReport, LearningSignal, Outcome } from "./types";

type PostRow = { group_id: string | null; variation_id: string | null; property_id: string | null; status: string | null; scheduled_at: string | null; published_at: string | null; reach: number | null; leads_count: number | null };
type GroupRow = { id: string; name: string | null; city: string | null };
type VarRow = { id: string; angle: string | null };

const ANGLE_HE: Record<string, string> = { lifestyle: "לייף-סטייל", investment: "השקעה", family: "משפחתי", urgency: "דחיפות" };

async function buildSignals(): Promise<LearningSignal[]> {
  const supabase = await createClient();
  const [postsRes, groupsRes, varsRes] = await Promise.all([
    supabase.from("distribution_posts" as never).select("group_id,variation_id,property_id,status,scheduled_at,published_at,reach,leads_count").limit(2000),
    supabase.from("distribution_groups" as never).select("id,name,city").limit(1000),
    supabase.from("distribution_variations" as never).select("id,angle").limit(2000),
  ]);
  const posts = (postsRes.data ?? []) as unknown as PostRow[];
  const groupById = new Map((((groupsRes.data ?? []) as unknown as GroupRow[])).map((g) => [g.id, g]));
  const angleById = new Map((((varsRes.data ?? []) as unknown as VarRow[])).map((v) => [v.id, v.angle]));

  const signals: LearningSignal[] = [];
  for (const p of posts) {
    const attempted = p.status === "published" || !!p.published_at || (p.status === "failed");
    if (!attempted) continue; // only definitive outcomes teach us anything
    const outcome: Outcome = p.status === "failed" ? "failure" : (p.leads_count ?? 0) > 0 ? "success" : "failure";
    const at = p.published_at ?? p.scheduled_at ?? new Date().toISOString();

    if (p.group_id) {
      const g = groupById.get(p.group_id);
      signals.push({ dimension: "group", value: p.group_id, label: g?.name ?? "קבוצה", outcome, at });
      if (g?.city) signals.push({ dimension: "street", value: g.city, label: g.city, outcome, at });
    }
    if (p.variation_id) {
      const angle = angleById.get(p.variation_id);
      if (angle) signals.push({ dimension: "copy_angle", value: angle, label: ANGLE_HE[angle] ?? angle, outcome, at });
    }
    const hourSrc = p.published_at ?? p.scheduled_at;
    if (hourSrc) { const h = new Date(hourSrc).getUTCHours(); const b = `${String(h).padStart(2, "0")}:00`; signals.push({ dimension: "hour", value: b, label: b, outcome, at }); }
  }
  return signals;
}

/** The org's learned patterns + advisory recommendations (cached). */
export async function getLearningReport(): Promise<LearningReport> {
  const { profile, organization } = await getSessionContext();
  const orgId = profile?.org_id ?? organization?.id ?? null;
  if (orgId) {
    const hit = await getCache<LearningReport>(orgId, "self_learning_report", []).catch(() => null);
    if (hit) return hit.value;
  }

  const signals = await buildSignals().catch(() => [] as LearningSignal[]);
  const report = learnPatterns(signals);
  report.generatedAt = new Date().toISOString();

  if (orgId) await setCache(orgId, "self_learning_report", [], report as unknown as Json, { ttlSeconds: 600, version: SELF_LEARNING_VERSION }).catch(() => {});
  return report;
}

/** Advisory recommendations only (consumable by other engines/UI). */
export async function getLearningRecommendations() {
  return (await getLearningReport()).recommendations;
}
