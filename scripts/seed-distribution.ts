/**
 * LOCAL-DEV-ONLY seed for the Distribution Center.
 *
 * Inserts a small set of realistic distribution_* rows for ONE org so the UI can
 * be exercised against real Supabase data during development. This is NOT wired
 * into any production UI and refuses to run against production.
 *
 * Run:
 *   npm run seed:distribution -- --org=<ORG_UUID> [--confirm]
 *
 * Env (from .env.local or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (writes bypass RLS — server-only, local dev)
 *
 * Guards:
 *   • Aborts if NODE_ENV === "production".
 *   • Requires an explicit --org=<uuid>.
 *   • Requires --confirm to actually write.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("✋ Refusing to seed in production. This script is local-dev only.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orgId = arg("org") || process.env.ZONO_SEED_ORG_ID;
  if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
  if (!orgId) { console.error("Missing --org=<ORG_UUID> (or ZONO_SEED_ORG_ID)."); process.exit(1); }
  if (!hasFlag("confirm")) {
    console.log(`Dry run. Would seed distribution data for org ${orgId}. Re-run with --confirm to write.`);
    process.exit(0);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const log = (label: string, error: { message: string } | null, n = 0) =>
    error ? console.error(`  ✗ ${label}: ${error.message}`) : console.log(`  ✓ ${label}${n ? ` (${n})` : ""}`);

  console.log(`Seeding distribution data for org ${orgId} …`);

  // 1) Groups
  const groups = [
    { org_id: orgId, name: "נדל״ן תל אביב והמרכז", platform: "facebook", category: "real_estate", city: "תל אביב", locality: "מרכז", members_count: 18400, status: "active", performance_score: 82, group_url: "https://facebook.com/groups/ta-realestate" },
    { org_id: orgId, name: "דירות להשקעה בישראל", platform: "facebook", category: "real_estate", city: "תל אביב", locality: "ארצי", members_count: 32100, status: "active", performance_score: 74, group_url: "https://facebook.com/groups/invest-il" },
    { org_id: orgId, name: "משפחות בשרון", platform: "facebook", category: "community", city: "רעננה", locality: "השרון", members_count: 9600, status: "active", performance_score: 67, group_url: "https://facebook.com/groups/sharon-families" },
    { org_id: orgId, name: "יוקרה והרצליה פיתוח", platform: "facebook", category: "luxury", city: "הרצליה", locality: "השרון", members_count: 5400, status: "pending", performance_score: 55, group_url: "https://facebook.com/groups/herzliya-luxury" },
  ];
  const { data: gRows, error: gErr } = await db.from("distribution_groups").insert(groups).select("id");
  log("distribution_groups", gErr, gRows?.length);
  const groupIds = (gRows ?? []).map((r: { id: string }) => r.id);

  // 2) Campaign
  const { data: cRow, error: cErr } = await db.from("distribution_campaigns").insert({
    org_id: orgId, name: "השקת דירת 4 חדרים — מרכז תל אביב", status: "active",
    cities: ["תל אביב"], audience: "families", objective: "lead_generation", frequency: "3x_week",
  }).select("id").single();
  log("distribution_campaigns", cErr);
  const campaignId = (cRow as { id: string } | null)?.id ?? null;

  // 3) Campaign ↔ groups
  if (campaignId && groupIds.length) {
    const cg = groupIds.slice(0, 3).map((gid, i) => ({ org_id: orgId, campaign_id: campaignId, group_id: gid, status: "selected", recommended_order: i + 1, expected_reach: 5000 * (i + 1) }));
    const { data, error } = await db.from("distribution_campaign_groups").insert(cg).select("id");
    log("distribution_campaign_groups", error, data?.length);
    await db.from("distribution_campaigns").update({ total_groups: cg.length }).eq("id", campaignId);
  }

  // 4) Posts
  let postId: string | null = null;
  if (campaignId && groupIds.length) {
    const now = Date.now();
    const posts = [
      { org_id: orgId, campaign_id: campaignId, group_id: groupIds[0], platform: "facebook", status: "published", post_title: "דירת 4 חדרים מהממת בלב תל אביב", published_at: new Date(now - 86400000).toISOString(), reach: 8200, engagement: 410, leads_count: 6 },
      { org_id: orgId, campaign_id: campaignId, group_id: groupIds[1], platform: "facebook", status: "scheduled", post_title: "הזדמנות השקעה — תשואה גבוהה", scheduled_at: new Date(now + 86400000).toISOString() },
      { org_id: orgId, campaign_id: campaignId, group_id: groupIds[2], platform: "facebook", status: "pending", post_title: "בית מושלם למשפחה בשרון" },
    ];
    const { data, error } = await db.from("distribution_posts").insert(posts).select("id");
    log("distribution_posts", error, data?.length);
    postId = (data ?? [])[0]?.id ?? null;
  }

  // 5) Variations
  if (campaignId) {
    const variations = [
      { org_id: orgId, campaign_id: campaignId, post_id: postId, angle: "family", hook: "דמיינו את הילדים גדלים כאן", headline: "הבית שמשפחה שלמה תאהב", body: "4 חדרים מוארים במרכז תל אביב", cta: "שלחו הודעה לתיאום סיור", wow_score: 88, engagement_score: 81, prediction_score: 76, lead_score: 76, is_selected: true },
      { org_id: orgId, campaign_id: campaignId, post_id: null, angle: "investment", hook: "המספרים מדברים בעד עצמם", headline: "הזדמנות השקעה שלא חוזרת", body: "תשואה אטרקטיבית במיקום מנצח", cta: "בקשו את ניתוח התשואה", wow_score: 79, engagement_score: 72, prediction_score: 84, lead_score: 84, is_selected: true },
    ];
    const { data, error } = await db.from("distribution_variations").insert(variations).select("id");
    log("distribution_variations", error, data?.length);
  }

  // 6) Comments
  if (postId) {
    const comments = [
      { org_id: orgId, post_id: postId, group_id: groupIds[0], author_name: "דנה לוי", external_comment_id: "c_1001", comment_text: "מעוניינת בפרטים, אפשר מחיר?", sentiment: "positive", intent: "buyer", intent_score: 78, lead_intent_score: 78, is_lead: true },
      { org_id: orgId, post_id: postId, group_id: groupIds[0], author_name: "יוסי כהן", external_comment_id: "c_1002", comment_text: "כמה חדרים ובאיזו קומה?", sentiment: "neutral", intent: "question", intent_score: 42, lead_intent_score: 42, is_lead: false },
    ];
    const { data, error } = await db.from("distribution_comments").insert(comments).select("id");
    log("distribution_comments", error, data?.length);
  }

  // 7) Leads
  {
    const leads = [
      { org_id: orgId, campaign_id: campaignId, post_id: postId, name: "דנה לוי", phone: "0521234567", source: "comment", intent_score: 78, status: "new", notes: "הגיבה לפוסט — מבקשת מחיר" },
      { org_id: orgId, campaign_id: campaignId, name: "מירי אברהם", phone: "0539876543", source: "message", intent_score: 65, status: "contacted" },
    ];
    const { data, error } = await db.from("distribution_leads").insert(leads).select("id");
    log("distribution_leads", error, data?.length);
  }

  // 8) Analytics
  {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      { org_id: orgId, campaign_id: campaignId, group_id: groupIds[0], post_id: postId, period_date: today, posts_count: 1, impressions: 8200, clicks: 240, reach: 8200, engagement: 410, comments_count: 2, leads_count: 6, conversion_rate: 2.5, success_rate: 100 },
    ];
    const { data, error } = await db.from("distribution_analytics").insert(rows).select("id");
    log("distribution_analytics", error, data?.length);
  }

  // 9) Automation
  {
    const { data, error } = await db.from("distribution_automations").insert({
      org_id: orgId, campaign_id: campaignId, name: "פרסום חוזר לקבוצות מנצחות", automation_type: "auto_repost",
      config_json: { frequency: "weekly", min_roi: 70 }, status: "active", is_enabled: true,
    }).select("id");
    log("distribution_automations", error, data?.length);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
