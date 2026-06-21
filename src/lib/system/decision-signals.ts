/**
 * Infrastructure signals for the Decision Brain (Part 14 of the hardening pack).
 * Produces additive attention items — data_quality_risk, engine_stale,
 * geo/transaction_coverage_gap, missing_operating_area, routing_gap — that flow
 * into the existing Priority Queue / Today's Focus / Executive Dashboard.
 *
 * Deliberately self-contained (queries tables directly) to avoid importing the
 * engine registry, which would create an import cycle with the Decision Brain.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDataQualitySummary } from "@/lib/data-quality/service";
import type { Database } from "@/lib/supabase/types";

type AttentionInsert = Database["public"]["Tables"]["attention_items"]["Insert"];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86_400_000;
const OPEN_LEAD_STAGES = ["new", "contacted", "qualified", "nurturing"];

export async function buildInfraAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const add = (title: string, reason: string, action: string, urgency: number, impact: number) => rows.push({
    org_id: orgId, entity_type: "system", entity_id: orgId,
    attention_score: clamp((urgency + impact) / 2), urgency_score: clamp(urgency), impact_score: clamp(impact), confidence_score: 85,
    revenue_impact_score: clamp(impact), relationship_impact_score: 0, churn_impact_score: 0,
    title, reason, recommended_action: action, expected_outcome: "תשתית תקינה למודיעין מדויק", status: "open",
  });

  try {
    // missing_operating_area
    const { data: areas } = await supabase.from("user_operating_localities").select("city_name,use_for_transactions").eq("organization_id", orgId).eq("is_active", true);
    const active = areas ?? [];
    if (!active.length) add("לא הוגדרו אזורי פעילות", "אין ערי פעילות — למודיעין אין בסיס גאוגרפי", "הגדר עיר ב׳אזורי פעילות׳", 82, 72);

    // engine_stale / errors
    const { data: runs } = await supabase.from("engine_runs").select("engine_key,status,finished_at").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(400);
    const latest = new Map<string, { status: string; finished_at: string | null }>();
    for (const r of (runs ?? []) as { engine_key: string; status: string; finished_at: string | null }[]) if (!latest.has(r.engine_key)) latest.set(r.engine_key, r);
    const now = Date.now();
    let stale = 0, errored = 0;
    for (const r of latest.values()) {
      if (r.status === "error") errored++;
      else if (r.status === "success") { const age = r.finished_at ? now - new Date(r.finished_at).getTime() : Infinity; if (age > DAY) stale++; }
    }
    if (errored > 0) add(`${errored} מנועי חישוב בשגיאה`, "מנועים נכשלו בריצה האחרונה", "בדוק במרכז החישוב", 76, 66);
    else if (stale >= 3) add(`${stale} מנועים מיושנים`, "מנועי מודיעין לא חושבו מחדש מעל 24 שעות", "הרץ חישוב מחדש במרכז החישוב", 56, 56);

    // data_quality_risk
    try {
      const dq = await getDataQualitySummary();
      if (dq.score < 70) add(`איכות דאטה ${dq.score}/100`, `קטגוריות חלשות: ${dq.worst.map((w) => w.label).join(", ")}`, "טפל ב׳איכות דאטה׳", dq.score < 50 ? 74 : 54, 62);
    } catch { /* best-effort */ }

    // geo_coverage_gap + transaction_coverage_gap
    const cities = [...new Set(active.map((a) => a.city_name).filter((c): c is string => !!c))];
    if (cities.length) {
      const variants = [...new Set(cities.flatMap((c) => [c, c.replace(/קרית/g, "קריית")]))];
      const { count: hoods } = await supabase.from("israel_neighborhoods").select("id", { count: "exact", head: true }).in("city_name", variants);
      if (!hoods) add("חסר כיסוי שכונות", "לא נמצאו שכונות לערי הפעילות", "הרץ גילוי שכונות ב׳אזורי פעילות׳", 52, 46);
      if (active.some((a) => a.use_for_transactions)) {
        const { count: txn } = await supabase.from("property_transactions").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
        if (!txn) add("חסר כיסוי עסקאות", "אין עסקאות שוק במאגר לערי הפעילות", "סנכרן עסקאות במרכז הכיסוי", 60, 56);
      }
    }

    // routing_gap — open leads with no owner
    const { count: unrouted } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("owner_id", null).in("stage", OPEN_LEAD_STAGES as never);
    if ((unrouted ?? 0) > 0) add(`${unrouted} לידים ללא שיוך`, "לידים פתוחים ללא בעלים — סיכון לאובדן", "נתב לידים ב׳ניתוב לידים׳", 70, 60);
  } catch { /* infra signals are additive — never block the Decision Brain */ }

  return rows;
}

/**
 * Recommendation Intelligence OS → Decision Brain (Part 15). Surfaces the
 * highest-value open, reviewable recommendations as attention items so they
 * flow into Today's Focus / Priority Queue. Transaction-backed (high source
 * confidence) and high-revenue recommendations are prioritised. Additive and
 * best-effort — never blocks the Decision Brain. No auto-send is implied; these
 * are surfaced for review only.
 */
export async function buildRecommendationAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    const { data } = await supabase.from("recommendations")
      .select("id,title_hebrew,reason_hebrew,next_best_action_hebrew,recommendation_score,urgency_score,impact_score,confidence_score,expected_revenue,review_status,source_confidence")
      .eq("organization_id", orgId).in("status", ["new", "reviewed"])
      .gte("recommendation_score", 70).neq("review_status", "needs_more_data")
      .order("recommendation_score", { ascending: false }).limit(8);
    for (const r of (data ?? []) as { id: string; title_hebrew: string; reason_hebrew: string | null; next_best_action_hebrew: string | null; recommendation_score: number; urgency_score: number; impact_score: number; confidence_score: number; expected_revenue: number; source_confidence: string }[]) {
      const backed = r.source_confidence === "verified" || r.source_confidence === "high";
      rows.push({
        org_id: orgId, entity_type: "recommendation", entity_id: r.id,
        attention_score: clamp((r.recommendation_score + r.urgency_score) / 2),
        urgency_score: clamp(r.urgency_score), impact_score: clamp(r.impact_score), confidence_score: clamp(r.confidence_score),
        revenue_impact_score: clamp(r.impact_score), relationship_impact_score: 0, churn_impact_score: 0,
        title: backed ? `המלצה מגובת-עסקאות: ${r.title_hebrew}` : `המלצה בעלת ערך: ${r.title_hebrew}`,
        reason: r.reason_hebrew ?? "המלצה מוסברת בעלת ציון גבוה", recommended_action: r.next_best_action_hebrew ?? "בדוק ואשר ב׳מודיעין המלצות׳",
        expected_outcome: r.expected_revenue > 0 ? `הכנסה צפויה ₪${Math.round(r.expected_revenue).toLocaleString("he-IL")}` : "קידום עסקה",
        status: "open",
      });
    }
  } catch { /* recommendation signals are additive — never block the Decision Brain */ }
  return rows;
}
