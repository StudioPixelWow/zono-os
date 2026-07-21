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

/**
 * Territory Intelligence OS → Decision Brain (Part 17). Surfaces the highest-
 * value territory signals (white space, revenue opportunity, acquisition
 * hotspot, competitor threat, decline) as attention items so "where to work"
 * flows into Today's Focus / Priority Queue. Additive + best-effort. No auto-
 * assignment implied — these are surfaced for review only.
 */
export async function buildTerritoryAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const PRIORITY = new Set(["white_space", "revenue_opportunity", "acquisition_hotspot", "competitor_dominance", "territory_decline", "inventory_gap"]);
  try {
    const { data } = await supabase.from("territory_signals")
      .select("territory_profile_id,signal_type,score,confidence_score,title,reason,recommended_action")
      .eq("organization_id", orgId).eq("status", "open").gte("score", 60)
      .order("score", { ascending: false }).limit(10);
    for (const s of (data ?? []) as { territory_profile_id: string | null; signal_type: string; score: number; confidence_score: number; title: string; reason: string | null; recommended_action: string | null }[]) {
      if (!PRIORITY.has(s.signal_type)) continue;
      rows.push({
        org_id: orgId, entity_type: "territory", entity_id: s.territory_profile_id ?? orgId,
        attention_score: clamp(s.score), urgency_score: clamp(s.score * 0.8), impact_score: clamp(s.score),
        confidence_score: clamp(s.confidence_score),
        revenue_impact_score: s.signal_type === "revenue_opportunity" ? clamp(s.score) : clamp(s.score * 0.6),
        relationship_impact_score: 0, churn_impact_score: 0,
        title: s.title, reason: s.reason ?? "סיגנל טריטוריאלי בעל ציון גבוה",
        recommended_action: s.recommended_action ?? "בדוק ב׳מודיעין טריטוריות׳",
        expected_outcome: "מיקוד נכון של פעילות וגיוס", status: "open",
      });
    }
  } catch { /* territory signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Client Portal OS → Decision Brain (Part 15). Surfaces portal lifecycle signals
 * — viewed (hot: client engaged → follow up today), active-but-not-viewed after
 * 48h (nudge), and draft-ready-to-send — as attention items into Today's Focus /
 * Priority Queue. Additive + best-effort. No auto-send implied.
 */
export async function buildPortalAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const now = Date.now();
  const TYPE_HE: Record<string, string> = { buyer: "הקונה", seller: "המוכר", property: "המוכר", lead: "הליד", deal: "הלקוח" };
  try {
    const { data } = await supabase.from("client_portals")
      .select("id,portal_type,client_name,status,view_count,last_viewed_at,created_at")
      .eq("organization_id", orgId).in("status", ["draft", "active"]).order("created_at", { ascending: false }).limit(200);
    for (const p of (data ?? []) as { id: string; portal_type: string; client_name: string | null; status: string; view_count: number; last_viewed_at: string | null; created_at: string }[]) {
      const who = TYPE_HE[p.portal_type] ?? "הלקוח";
      const name = p.client_name ? ` (${p.client_name})` : "";
      if (p.status === "active" && p.view_count > 0 && p.last_viewed_at && (now - new Date(p.last_viewed_at).getTime()) < 2 * DAY) {
        rows.push({ org_id: orgId, entity_type: "client_portal", entity_id: p.id, attention_score: 82, urgency_score: 84, impact_score: 70, confidence_score: 90, revenue_impact_score: 60, relationship_impact_score: 40, churn_impact_score: 0,
          title: `${who} צפה/תה בפורטל${name}`, reason: "הלקוח התעניין בפורטל לאחרונה — חלון הזדמנות חם", recommended_action: "צור פולואפ עם הלקוח היום", expected_outcome: "קידום עסקה", status: "open" });
      } else if (p.status === "active" && p.view_count === 0 && (now - new Date(p.created_at).getTime()) > 2 * DAY) {
        rows.push({ org_id: orgId, entity_type: "client_portal", entity_id: p.id, attention_score: 56, urgency_score: 58, impact_score: 50, confidence_score: 80, revenue_impact_score: 40, relationship_impact_score: 30, churn_impact_score: 20,
          title: `פורטל${name} טרם נצפה`, reason: "הפורטל פעיל מעל 48 שעות ולא נצפה", recommended_action: "ודא שהקישור הגיע ובצע תזכורת", expected_outcome: "הגברת מעורבות", status: "open" });
      } else if (p.status === "draft") {
        rows.push({ org_id: orgId, entity_type: "client_portal", entity_id: p.id, attention_score: 48, urgency_score: 46, impact_score: 44, confidence_score: 85, revenue_impact_score: 30, relationship_impact_score: 20, churn_impact_score: 0,
          title: `פורטל${name} מוכן אך לא הופעל`, reason: "פורטל בטיוטה — אשר והפעל כדי לשתף", recommended_action: "אשר את הפורטל ושלח קישור", expected_outcome: "חוויית לקוח פרימיום", status: "open" });
      }
    }
  } catch { /* portal signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Office Website OS → Decision Brain. Surfaces new website leads (last 24h) that
 * need handling, plus a "site ready but not published" nudge, into Today's Focus
 * / Priority Queue. Additive + best-effort. No auto-send.
 */
export async function buildOfficeSiteAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const now = Date.now();
  try {
    const { count: freshLeads } = await supabase.from("office_website_leads")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId)
      .gte("created_at", new Date(now - DAY).toISOString());
    if ((freshLeads ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "office_website", entity_id: orgId,
        attention_score: 78, urgency_score: 82, impact_score: 66, confidence_score: 90, revenue_impact_score: 62, relationship_impact_score: 30, churn_impact_score: 0,
        title: `${freshLeads} פניות חדשות מאתר המשרד`, reason: "פניות חדשות מהאתר ב-24 השעות האחרונות — מהירות תגובה קריטית", recommended_action: "טפל בפניות מאתר המשרד עכשיו", expected_outcome: "המרת פניות ללקוחות", status: "open" });
    }
    const { data: site } = await supabase.from("office_websites").select("status").eq("organization_id", orgId).maybeSingle();
    const status = (site as { status?: string } | null)?.status;
    if (status === "draft") {
      rows.push({ org_id: orgId, entity_type: "office_website", entity_id: orgId,
        attention_score: 44, urgency_score: 42, impact_score: 50, confidence_score: 85, revenue_impact_score: 40, relationship_impact_score: 10, churn_impact_score: 0,
        title: "אתר המשרד מוכן אך לא פורסם", reason: "האתר בטיוטה — פרסום יפתח ערוץ לידים חדש", recommended_action: "ערוך, אשר ופרסם את אתר המשרד", expected_outcome: "ערוץ לידים אורגני", status: "open" });
    }
  } catch { /* office-site signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Agent Website OS → Decision Brain. Surfaces new agent-website leads (last 24h)
 * that need handling into Today's Focus / Priority Queue. Additive + best-effort.
 */
export async function buildAgentSiteAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const now = Date.now();
  try {
    const { count: fresh } = await supabase.from("agent_website_leads")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId)
      .gte("created_at", new Date(now - DAY).toISOString());
    if ((fresh ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "agent_website", entity_id: orgId,
        attention_score: 78, urgency_score: 82, impact_score: 66, confidence_score: 90, revenue_impact_score: 62, relationship_impact_score: 30, churn_impact_score: 0,
        title: `${fresh} פניות חדשות מאתרי הסוכנים`, reason: "פניות חדשות מאתרים אישיים ב-24 השעות האחרונות", recommended_action: "טפל בפניות מאתרי הסוכנים עכשיו", expected_outcome: "המרת פניות ללקוחות", status: "open" });
    }
  } catch { /* agent-site signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Automation & Workflow OS → Decision Brain. Consumes workflow lifecycle:
 * runs pending approval (workflow_recommended), blocked/failed runs
 * (workflow_blocked / workflow_failed), generated opportunities
 * (workflow_generated_opportunity) and "create this workflow" hints. Additive
 * + best-effort: automation signals never block the Decision Brain.
 */
export async function buildAutomationAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    const { count: pending } = await supabase.from("automation_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending_review");
    if ((pending ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "automation", entity_id: orgId,
        attention_score: 80, urgency_score: 84, impact_score: 64, confidence_score: 92, revenue_impact_score: 55, relationship_impact_score: 20, churn_impact_score: 0,
        title: `${pending} ריצות אוטומציה ממתינות לאישור`, reason: "אוטומציות הכינו פעולות וממתינות לאישור אנושי", recommended_action: "אשר או דחה במרכז האוטומציה", expected_outcome: "ביצוע מתוזמר של פעולות מוכנות", status: "open" });
    }
    const { count: failed } = await supabase.from("automation_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", ["failed", "blocked"]).gte("created_at", new Date(Date.now() - DAY * 3).toISOString());
    if ((failed ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "automation", entity_id: orgId,
        attention_score: 68, urgency_score: 60, impact_score: 50, confidence_score: 85, revenue_impact_score: 30, relationship_impact_score: 10, churn_impact_score: 0,
        title: `${failed} ריצות אוטומציה נכשלו/נחסמו`, reason: "ריצות אוטומציה לא הושלמו ב-3 הימים האחרונים", recommended_action: "בדוק יומני ריצה במרכז האוטומציה", expected_outcome: "תיקון תהליכים ושיפור אמינות", status: "open" });
    }
    const { count: recos } = await supabase.from("automation_recommendations")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "open");
    if ((recos ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "automation", entity_id: orgId,
        attention_score: 58, urgency_score: 40, impact_score: 60, confidence_score: 80, revenue_impact_score: 48, relationship_impact_score: 15, churn_impact_score: 0,
        title: `${recos} אוטומציות מומלצות להפעלה`, reason: "מנוע ההחלטות זיהה תהליכים שכדאי להפעיל", recommended_action: "עיין בהמלצות במרכז האוטומציה", expected_outcome: "כיסוי רחב יותר של פעולות מתוזמרות", status: "open" });
    }
    // Library coverage nudge: full library seeded but org enabled none yet.
    const { count: enabledLib } = await supabase.from("automation_workflows")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).not("template_key", "is", null);
    if ((enabledLib ?? 0) === 0) {
      const { count: libTotal } = await supabase.from("automation_templates")
        .select("id", { count: "exact", head: true }).not("risk_level", "is", null);
      if ((libTotal ?? 0) > 0) {
        rows.push({ org_id: orgId, entity_type: "automation", entity_id: orgId,
          attention_score: 54, urgency_score: 32, impact_score: 64, confidence_score: 78, revenue_impact_score: 50, relationship_impact_score: 12, churn_impact_score: 0,
          title: `${libTotal} אוטומציות מוכנות — אף אחת לא הופעלה`, reason: "ספריית האוטומציות זמינה אך טרם הופעלו תהליכים", recommended_action: "הפעל אוטומציות בטוחות מומלצות בספרייה", expected_outcome: "התחלת תזמור פעולות וחיסכון בזמן", status: "open" });
      }
    }
  } catch { /* automation signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Documents & Signature OS → Decision Brain. Surfaces signature/compliance
 * risk: documents awaiting signature, deals blocked by missing required
 * documents, and documents expiring soon. Additive + best-effort.
 */
export async function buildDocumentAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    const { count: pending } = await supabase.from("documents")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).in("signature_status", ["pending_signature", "partially_signed"]);
    if ((pending ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "document", entity_id: orgId,
        attention_score: 74, urgency_score: 78, impact_score: 60, confidence_score: 90, revenue_impact_score: 55, relationship_impact_score: 25, churn_impact_score: 10,
        title: `${pending} מסמכים ממתינים לחתימה`, reason: "מסמכים שנשלחו/הוכנו לחתימה וטרם הושלמו", recommended_action: "השלם חתימות במרכז המסמכים", expected_outcome: "קידום עסקאות ועמידה בדרישות", status: "open" });
    }
    const { data: blocked } = await supabase.from("document_checklists")
      .select("blocking_count").eq("organization_id", orgId).gt("blocking_count", 0);
    const blockedDeals = (blocked ?? []).length;
    if (blockedDeals > 0) {
      rows.push({ org_id: orgId, entity_type: "document", entity_id: orgId,
        attention_score: 86, urgency_score: 88, impact_score: 76, confidence_score: 92, revenue_impact_score: 72, relationship_impact_score: 20, churn_impact_score: 14,
        title: `${blockedDeals} עסקאות חסומות בשל מסמכים חסרים`, reason: "מסמך חוסם נדרש חסר או לא חתום", recommended_action: "השלם את המסמכים החוסמים כדי לקדם את העסקה", expected_outcome: "שחרור חסם והאצת סגירה", status: "open" });
    }
    const { count: expiring } = await supabase.from("documents")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("signature_status", "completed")
      .gte("expires_at", new Date().toISOString()).lte("expires_at", new Date(Date.now() + DAY * 14).toISOString());
    if ((expiring ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "document", entity_id: orgId,
        attention_score: 64, urgency_score: 70, impact_score: 50, confidence_score: 85, revenue_impact_score: 40, relationship_impact_score: 15, churn_impact_score: 8,
        title: `${expiring} מסמכים פגי תוקף בקרוב`, reason: "מסמכים שתוקפם יפוג ב-14 הימים הקרובים", recommended_action: "חדש או החתם לפני פקיעת התוקף", expected_outcome: "שמירה על תקפות ועמידה בדרישות", status: "open" });
    }
  } catch { /* document signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Mortgage & Financing Intelligence OS → Decision Brain. Surfaces financing
 * risk (buyers who may not be able to purchase), high-readiness buyers worth
 * prioritising, and cash-gap alerts. Additive + best-effort.
 */
export async function buildFinancingAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    const { count: risk } = await supabase.from("buyer_financial_profiles")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("financing_risk", ["high", "critical"]);
    if ((risk ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "financing", entity_id: orgId,
        attention_score: 80, urgency_score: 78, impact_score: 72, confidence_score: 88, revenue_impact_score: 70, relationship_impact_score: 20, churn_impact_score: 18,
        title: `${risk} קונים בסיכון מימוני`, reason: "סבירות אישור נמוכה או פער מזומן — עלול לעכב/לבטל עסקה", recommended_action: "הפנה לייעוץ מימוני וודא ריאליות התקציב", expected_outcome: "הפחתת סיכון לעיכוב עסקאות", status: "open" });
    }
    const { count: ready } = await supabase.from("buyer_financial_profiles")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("readiness_band", "ready");
    if ((ready ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "financing", entity_id: orgId,
        attention_score: 76, urgency_score: 66, impact_score: 70, confidence_score: 90, revenue_impact_score: 74, relationship_impact_score: 24, churn_impact_score: 0,
        title: `${ready} קונים מוכנים מימונית לרכישה`, reason: "כושר רכישה גבוה והון עצמי מספק — בשלים לקידום", recommended_action: "תעדף הצגת נכסים מתאימים והאץ לעסקה", expected_outcome: "האצת הכנסה מקונים בשלים", status: "open" });
    }
    const { count: cash } = await supabase.from("buyer_financial_profiles")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).gt("cash_gap", 0);
    if ((cash ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "financing", entity_id: orgId,
        attention_score: 66, urgency_score: 58, impact_score: 56, confidence_score: 84, revenue_impact_score: 50, relationship_impact_score: 18, churn_impact_score: 12,
        title: `${cash} קונים עם פער מזומן`, reason: "חסר הון עצמי להשלמת הרכישה", recommended_action: "בחן מקורות הון נוספים או התאם תקציב", expected_outcome: "גישור פער המזומן וקידום העסקה", status: "open" });
    }
  } catch { /* financing signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Review, Referral & Reputation OS → Decision Brain. Surfaces review/referral
 * opportunities, ambassador candidates, high-influence clients and referral
 * revenue. Reads the precomputed reputation_signals. Additive + best-effort.
 */
export async function buildReputationAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  const SCORES: Record<string, { att: number; urg: number; imp: number; rev: number; rel: number }> = {
    review_opportunity: { att: 64, urg: 56, imp: 50, rev: 30, rel: 40 },
    referral_opportunity: { att: 74, urg: 64, imp: 64, rev: 60, rel: 45 },
    ambassador_candidate: { att: 82, urg: 58, imp: 76, rev: 70, rel: 60 },
    high_influence_client: { att: 78, urg: 60, imp: 70, rev: 64, rel: 55 },
    referral_revenue: { att: 70, urg: 50, imp: 66, rev: 72, rel: 40 },
  };
  try {
    const { data } = await supabase.from("reputation_signals")
      .select("signal_type,buyer_id,title,reason,recommended_action").eq("organization_id", orgId).eq("status", "open")
      .order("score", { ascending: false }).limit(12);
    for (const s of (data ?? []) as { signal_type: string; buyer_id: string | null; title: string; reason: string | null; recommended_action: string | null }[]) {
      const sc = SCORES[s.signal_type]; if (!sc) continue;
      rows.push({ org_id: orgId, entity_type: "reputation", entity_id: s.buyer_id ?? orgId,
        attention_score: sc.att, urgency_score: sc.urg, impact_score: sc.imp, confidence_score: 86,
        revenue_impact_score: sc.rev, relationship_impact_score: sc.rel, churn_impact_score: 0,
        title: s.title, reason: s.reason ?? "אות מוניטין/הפניה", recommended_action: s.recommended_action ?? "בדוק במרכז המוניטין", expected_outcome: "הגדלת הפניות, ביקורות והכנסה חוזרת", status: "open" });
    }
  } catch { /* reputation signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * Community Discovery & Execution OS → Decision Brain. Surfaces hot community
 * comments awaiting conversion, high-ROI communities worth doubling down on, and
 * low-ROI communities worth reviewing. Additive + best-effort.
 */
export async function buildCommunityAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    const { count: hot } = await supabase.from("community_comments")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "new")
      .in("intent", ["viewing_request", "buyer_intent", "seller_intent", "price_request"]);
    if ((hot ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "community", entity_id: orgId,
        attention_score: 76, urgency_score: 80, impact_score: 58, confidence_score: 84, revenue_impact_score: 55, relationship_impact_score: 30, churn_impact_score: 0,
        title: `${hot} תגובות בכוונה גבוהה בקהילות`, reason: "תגובות עם כוונת קנייה/מכירה/צפייה שטרם הומרו לליד", recommended_action: "המר תגובות חמות ללידים במרכז הקהילות", expected_outcome: "לכידת לידים חמים מקהילות", status: "open" });
    }
    const { data: top } = await supabase.from("community_profiles")
      .select("name,roi_score").eq("organization_id", orgId).gte("roi_score", 75).order("roi_score", { ascending: false }).limit(1);
    const best = (top ?? [])[0] as { name: string; roi_score: number } | undefined;
    if (best) {
      rows.push({ org_id: orgId, entity_type: "community", entity_id: orgId,
        attention_score: 70, urgency_score: 52, impact_score: 66, confidence_score: 86, revenue_impact_score: 64, relationship_impact_score: 24, churn_impact_score: 0,
        title: `קהילת ROI גבוה — ${best.name}`, reason: "קהילה בעלת תשואה גבוהה שכדאי להגביר בה פעילות", recommended_action: "הגבר פרסום וגיוס מקהילה זו", expected_outcome: "הגדלת לידים והכנסה מקהילה מובילה", status: "open" });
    }
  } catch { /* community signals are additive — never block the Decision Brain */ }
  return rows;
}

export async function buildWhatsappAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    // Hot WhatsApp leads — high lead score, still open
    const { count: hot } = await supabase.from("whatsapp_conversations")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("lead_score", 75).neq("state", "closed");
    if ((hot ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "whatsapp", entity_id: orgId,
        attention_score: 82, urgency_score: 86, impact_score: 64, confidence_score: 85, revenue_impact_score: 62, relationship_impact_score: 34, churn_impact_score: 18,
        title: `${hot} לידים חמים בוואטסאפ`, reason: "שיחות וואטסאפ עם ציון ליד גבוה הממתינות למענה", recommended_action: "צור קשר היום במרכז הוואטסאפ", expected_outcome: "המרת לידים חמים לפגישות", status: "open" });
    }
    // Drafts pending approval (sensitive content)
    const { count: appr } = await supabase.from("whatsapp_drafts")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("approval_status", "pending");
    if ((appr ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "whatsapp", entity_id: orgId,
        attention_score: 74, urgency_score: 78, impact_score: 50, confidence_score: 90, revenue_impact_score: 40, relationship_impact_score: 28, churn_impact_score: 22,
        title: `${appr} הודעות וואטסאפ ממתינות לאישור`, reason: "טיוטות בנושאים רגישים (מחיר/משפטי/מו״מ) הדורשות אישור לפני שליחה", recommended_action: "אשר או דחה במרכז האישורים", expected_outcome: "המשך תקשורת תואמת מדיניות", status: "open" });
    }
    // Missed calls awaiting recovery
    const { count: missed } = await supabase.from("whatsapp_call_events")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("event_type", "missed").neq("recovery_status", "recovered");
    if ((missed ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "whatsapp", entity_id: orgId,
        attention_score: 70, urgency_score: 80, impact_score: 48, confidence_score: 82, revenue_impact_score: 38, relationship_impact_score: 36, churn_impact_score: 40,
        title: `${missed} שיחות שלא נענו לשחזור`, reason: "שיחות נכנסות שלא נענו — חלון שחזור מהיר קריטי", recommended_action: "שלח טיוטת שחזור ידנית במרכז הוואטסאפ", expected_outcome: "מניעת אובדן לידים משיחות שלא נענו", status: "open" });
    }
    // Silent / stale conversations — reactivation
    const cutoff = new Date(Date.now() - 5 * DAY).toISOString();
    const { count: silent } = await supabase.from("whatsapp_conversations")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgId).neq("state", "closed").lt("last_message_at", cutoff);
    if ((silent ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "whatsapp", entity_id: orgId,
        attention_score: clamp(56 + Math.min(20, (silent ?? 0))), urgency_score: 46, impact_score: 44, confidence_score: 78, revenue_impact_score: 36, relationship_impact_score: 40, churn_impact_score: 52,
        title: `${silent} שיחות וואטסאפ שקטות`, reason: "שיחות ללא פעילות מעל 5 ימים — סיכון נטישה", recommended_action: "הפעל מסע החייאה מבוקר", expected_outcome: "החזרת לידים שקטים למעורבות", status: "open" });
    }
  } catch { /* whatsapp signals are additive — never block the Decision Brain */ }
  return rows;
}

export async function buildCommIntelAttentionRows(orgId: string): Promise<AttentionInsert[]> {
  const supabase = await createClient();
  const rows: AttentionInsert[] = [];
  try {
    // communication risks (highest-scoring open)
    const { data: risks } = await supabase.from("communication_risks")
      .select("entity_type,entity_id,risk_type,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").gte("score", 50).order("score", { ascending: false }).limit(5);
    for (const r of (risks ?? []) as { entity_type: string; entity_id: string; risk_type: string; score: number; reason: string | null; recommended_action: string | null }[]) {
      rows.push({ org_id: orgId, entity_type: r.entity_type, entity_id: r.entity_id,
        attention_score: clamp(r.score), urgency_score: clamp(r.score + 6), impact_score: 56, confidence_score: 80, revenue_impact_score: 48, relationship_impact_score: 44, churn_impact_score: clamp(r.score),
        title: `סיכון תקשורת — ${r.risk_type}`, reason: r.reason ?? "סיכון בתקשורת עם הלקוח", recommended_action: r.recommended_action ?? "טפל בקשר", expected_outcome: "מניעת אובדן לקוח/עסקה", status: "open" });
    }
    // communication opportunities
    const { data: opps } = await supabase.from("communication_opportunities")
      .select("entity_type,entity_id,opportunity_type,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").gte("score", 60).order("score", { ascending: false }).limit(5);
    for (const o of (opps ?? []) as { entity_type: string; entity_id: string; opportunity_type: string; score: number; reason: string | null; recommended_action: string | null }[]) {
      rows.push({ org_id: orgId, entity_type: o.entity_type, entity_id: o.entity_id,
        attention_score: clamp(o.score), urgency_score: clamp(o.score - 4), impact_score: 62, confidence_score: 82, revenue_impact_score: clamp(o.score), relationship_impact_score: 30, churn_impact_score: 0,
        title: `הזדמנות תקשורת — ${o.opportunity_type}`, reason: o.reason ?? "סימני מוכנות בתקשורת", recommended_action: o.recommended_action ?? "פעל על ההזדמנות", expected_outcome: "קידום עסקה/הפניה", status: "open" });
    }
    // broken commitments
    const { count: broken } = await supabase.from("communication_commitments")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "broken");
    if ((broken ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "communication", entity_id: orgId,
        attention_score: 72, urgency_score: 78, impact_score: 52, confidence_score: 88, revenue_impact_score: 40, relationship_impact_score: 56, churn_impact_score: 50,
        title: `${broken} התחייבויות שנשברו`, reason: "הבטחות שניתנו ללקוחות ולא קוימו — פגיעה באמון", recommended_action: "השלם והחזר אמון במרכז התקשורת", expected_outcome: "שיקום אמון ומומנטום", status: "open" });
    }
    // new unresolved objections
    const cutoff = new Date(Date.now() - 7 * DAY).toISOString();
    const { count: objs } = await supabase.from("communication_objections")
      .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("resolved", false).gte("detected_at", cutoff);
    if ((objs ?? 0) > 0) {
      rows.push({ org_id: orgId, entity_type: "communication", entity_id: orgId,
        attention_score: 66, urgency_score: 60, impact_score: 50, confidence_score: 80, revenue_impact_score: 44, relationship_impact_score: 38, churn_impact_score: 36,
        title: `${objs} התנגדויות חדשות שטרם טופלו`, reason: "התנגדויות שזוהו בתקשורת ועדיין פתוחות", recommended_action: "טפל בהתנגדויות לפי חומרה", expected_outcome: "הסרת חסמים לסגירה", status: "open" });
    }
  } catch { /* comm-intel signals are additive — never block the Decision Brain */ }
  return rows;
}

/**
 * LEGACY — RETIRED (Batch 5.6I). DO NOT USE FOR CANONICAL JOURNEY REASONING.
 *
 * This used to fabricate "ready to close" / "stuck journey" attention items
 * from journeys.conversion_score / risk_score / velocity_state and the
 * journey_risks / journey_opportunities satellite tables — ALL written only by
 * the deleted journey-intelligence engine. Those columns are schema defaults
 * (or frozen history) now that the engine is gone; reading them would surface
 * invented urgency from stale scores.
 *
 * Canonical journey attention already reaches brokers through the evidence-
 * gated Broker Intelligence queue (stall recommendations with verified dwell)
 * -> Daily OS / Home / Executive / Copilot. The Decision Brain therefore gets
 * NO separate journey feed: an empty contribution is the honest one. The
 * export survives so the composition stays stable; delete it together with the
 * satellite tables once the schema cleanup batch lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept stable for the Decision Brain composition
export async function buildJourneyAttentionRows(_orgId: string): Promise<AttentionInsert[]> {
  return [];
}
