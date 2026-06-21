/**
 * Data Quality Center service (server-only, READ-ONLY).
 *
 * Deterministically scans the org's core entities for broken/incomplete data
 * that would degrade intelligence downstream, and produces a health score per
 * category + a list of concrete issues. No writes, no AI. Bounded fetches.
 * Also exposes a compact summary the Decision Brain can consume as
 * `data_quality_risk`.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

const SEV_WEIGHT: Record<string, number> = { critical: 1, high: 0.7, medium: 0.4, low: 0.2 };
const ACTIVE_PROP = new Set(["draft", "active", "under_offer", "in_contract", "ready", "published"]);
const STALE_DAYS = 90;
const REC_STALE_DAYS = 14;
const DAY = 86_400_000;

export interface DQIssue { key: string; label: string; count: number; severity: "critical" | "high" | "medium" | "low" }
export interface DQCategory { key: string; label: string; total: number; healthScore: number; issues: DQIssue[] }
export interface DataQualityReport { overallScore: number; categories: DQCategory[]; generatedAt: string }

function score(total: number, issues: DQIssue[]): number {
  if (!total) return 100;
  let penalty = 0;
  for (const i of issues) penalty += (i.count / total) * (SEV_WEIGHT[i.severity] ?? 0.3);
  return Math.max(0, Math.min(100, Math.round(100 - penalty * 100)));
}
const cat = (key: string, label: string, total: number, issues: DQIssue[]): DQCategory => ({ key, label, total, issues: issues.filter((i) => i.count > 0), healthScore: score(total, issues) });

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { orgId: profile.org_id };
}

export async function getDataQualityReport(): Promise<DataQualityReport> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const now = Date.now();

  const [propsRes, buyersRes, sellersRes, leadsRes, txnRes, extRes, commRes, recRes] = await Promise.all([
    supabase.from("properties").select("id,status,price,size_sqm,city,seller_id,latitude,longitude,location,updated_at").eq("org_id", orgId).limit(4000),
    supabase.from("buyers").select("id,budget_min,budget_max,preferred_areas,updated_at").eq("org_id", orgId).limit(4000),
    supabase.from("sellers").select("id,phone").eq("org_id", orgId).limit(4000),
    supabase.from("leads").select("id,owner_id,phone,last_activity_at,stage").eq("org_id", orgId).limit(4000),
    supabase.from("property_transactions").select("id,neighborhood_name,normalized_address,asset_id").eq("organization_id", orgId).limit(5000),
    supabase.from("external_listings").select("id,city,opportunity_score,duplicate_group_id,status").eq("org_id", orgId).limit(4000),
    supabase.from("community_profiles").select("id,status,members_count").eq("organization_id", orgId).limit(2000),
    supabase.from("decision_recommendations").select("id,confidence_score,generated_at").eq("org_id", orgId).limit(2000),
  ]);

  const categories: DQCategory[] = [];

  // ── Properties ──
  {
    const rows = propsRes.data ?? [];
    const active = rows.filter((p) => ACTIVE_PROP.has(p.status));
    const loc = (p: typeof rows[number]) => (p.location ?? {}) as { address?: string; city?: string; neighborhood?: string };
    categories.push(cat("properties", "נכסים", rows.length, [
      { key: "missing_address", label: "חסרה כתובת", severity: "medium", count: active.filter((p) => { const l = loc(p); return !l.address && !l.neighborhood; }).length },
      { key: "missing_city", label: "חסרה עיר", severity: "high", count: active.filter((p) => !p.city && !loc(p).city).length },
      { key: "missing_geo", label: "חסר מיקום גאוגרפי", severity: "low", count: active.filter((p) => p.latitude == null || p.longitude == null).length },
      { key: "missing_seller", label: "ללא מוכר מקושר", severity: "high", count: active.filter((p) => !p.seller_id).length },
      { key: "invalid_pricing", label: "תמחור לא תקין", severity: "critical", count: active.filter((p) => p.price == null || Number(p.price) <= 0).length },
    ]));
  }

  // ── Buyers ──
  {
    const rows = buyersRes.data ?? [];
    categories.push(cat("buyers", "קונים", rows.length, [
      { key: "missing_budget", label: "חסר תקציב", severity: "high", count: rows.filter((b) => b.budget_min == null && b.budget_max == null).length },
      { key: "missing_locality", label: "חסר אזור חיפוש", severity: "medium", count: rows.filter((b) => !(b.preferred_areas ?? []).length).length },
      { key: "stale_profile", label: "פרופיל לא מעודכן (90 ימים+)", severity: "low", count: rows.filter((b) => b.updated_at && now - new Date(b.updated_at).getTime() > STALE_DAYS * DAY).length },
    ]));
  }

  // ── Sellers ──
  {
    const rows = sellersRes.data ?? [];
    const sellerIdsWithProp = new Set((propsRes.data ?? []).map((p) => p.seller_id).filter((x): x is string => !!x));
    categories.push(cat("sellers", "מוכרים", rows.length, [
      { key: "missing_phone", label: "חסר טלפון", severity: "high", count: rows.filter((s) => !s.phone).length },
      { key: "missing_property", label: "ללא נכס מקושר", severity: "medium", count: rows.filter((s) => !sellerIdsWithProp.has(s.id)).length },
    ]));
  }

  // ── Leads ──
  {
    const rows = leadsRes.data ?? [];
    const phoneCounts = new Map<string, number>();
    for (const l of rows) if (l.phone) phoneCounts.set(l.phone, (phoneCounts.get(l.phone) ?? 0) + 1);
    const openStages = new Set(["new", "contacted", "qualified", "nurturing"]);
    categories.push(cat("leads", "לידים", rows.length, [
      { key: "no_owner", label: "ללא בעלים", severity: "high", count: rows.filter((l) => !l.owner_id && openStages.has(l.stage)).length },
      { key: "no_followup", label: "ללא מעקב", severity: "medium", count: rows.filter((l) => openStages.has(l.stage) && !l.last_activity_at).length },
      { key: "duplicate_lead", label: "ליד כפול (טלפון)", severity: "low", count: rows.filter((l) => l.phone && (phoneCounts.get(l.phone) ?? 0) > 1).length },
    ]));
  }

  // ── Transactions ──
  {
    const rows = txnRes.data ?? [];
    const assetCounts = new Map<string, number>();
    for (const t of rows) if (t.asset_id) assetCounts.set(t.asset_id, (assetCounts.get(t.asset_id) ?? 0) + 1);
    categories.push(cat("transactions", "עסקאות", rows.length, [
      { key: "unresolved_geo", label: "מיקום לא ממופה", severity: "medium", count: rows.filter((t) => !t.neighborhood_name && !t.normalized_address).length },
      { key: "duplicate_txn", label: "עסקה כפולה", severity: "low", count: rows.filter((t) => t.asset_id && (assetCounts.get(t.asset_id) ?? 0) > 1).length },
    ]));
  }

  // ── External listings ──
  {
    const rows = (extRes.data ?? []).filter((e) => e.status === "active");
    categories.push(cat("external_listings", "נכסים חיצוניים", rows.length, [
      { key: "low_quality", label: "איכות נמוכה", severity: "low", count: rows.filter((e) => (e.opportunity_score ?? 0) < 30).length },
      { key: "unresolved_location", label: "מיקום לא ממופה", severity: "medium", count: rows.filter((e) => !e.city).length },
      { key: "duplicate", label: "כפילות", severity: "low", count: rows.filter((e) => !!e.duplicate_group_id).length },
    ]));
  }

  // ── Communities ──
  {
    const rows = commRes.data ?? [];
    categories.push(cat("communities", "קהילות", rows.length, [
      { key: "inactive", label: "לא פעילה", severity: "low", count: rows.filter((c) => c.status !== "active").length },
      { key: "incomplete", label: "חסרים נתונים", severity: "low", count: rows.filter((c) => !c.members_count).length },
    ]));
  }

  // ── Recommendations ──
  {
    const rows = recRes.data ?? [];
    categories.push(cat("recommendations", "המלצות", rows.length, [
      { key: "low_confidence", label: "ביטחון נמוך", severity: "low", count: rows.filter((r) => (r.confidence_score ?? 0) < 40).length },
      { key: "expired", label: "פגות תוקף (14 ימים+)", severity: "medium", count: rows.filter((r) => r.generated_at && now - new Date(r.generated_at).getTime() > REC_STALE_DAYS * DAY).length },
    ]));
  }

  const overallScore = categories.length ? Math.round(categories.reduce((a, c) => a + c.healthScore, 0) / categories.length) : 100;
  return { overallScore, categories, generatedAt: new Date().toISOString() };
}

/** Compact risk summary for the Decision Brain (data_quality_risk). */
export interface DataQualitySummary { score: number; worst: { key: string; label: string; healthScore: number }[]; criticalIssues: number }
export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const report = await getDataQualityReport();
  const worst = [...report.categories].sort((a, b) => a.healthScore - b.healthScore).slice(0, 3).map((c) => ({ key: c.key, label: c.label, healthScore: c.healthScore }));
  const criticalIssues = report.categories.reduce((a, c) => a + c.issues.filter((i) => i.severity === "critical").reduce((s, i) => s + i.count, 0), 0);
  return { score: report.overallScore, worst, criticalIssues };
}
