/**
 * Configuration Center (server-only). Reports the PRESENCE of each integration's
 * configuration — never the secret values. Pure boolean env checks.
 */
import "server-only";

export type ConfigStatus = "configured" | "partial" | "missing";
export interface ConfigItem { key: string; label: string; status: ConfigStatus; note: string }

const has = (name: string) => !!process.env[name];

export function getConfiguration(): ConfigItem[] {
  const supabaseParts = [has("NEXT_PUBLIC_SUPABASE_URL"), has("NEXT_PUBLIC_SUPABASE_ANON_KEY"), has("SUPABASE_SERVICE_ROLE_KEY")];
  const supabaseCount = supabaseParts.filter(Boolean).length;

  return [
    { key: "supabase", label: "Supabase", status: supabaseCount === 3 ? "configured" : supabaseCount > 0 ? "partial" : "missing", note: `${supabaseCount}/3 משתנים (URL, anon, service-role)` },
    { key: "apify", label: "Apify (עסקאות + נכסים חיצוניים)", status: has("APIFY_TOKEN") ? "configured" : "missing", note: has("APIFY_TOKEN") ? "טוקן מוגדר" : "חסר APIFY_TOKEN — סנכרון יחזיר נתוני הדגמה בפיתוח" },
    { key: "openai", label: "OpenAI (גילוי שכונות + קופי שיווקי)", status: has("OPENAI_API_KEY") ? "configured" : "missing", note: has("OPENAI_API_KEY") ? "מפתח מוגדר" : "חסר OPENAI_API_KEY — נופל לחלופה דטרמיניסטית" },
    { key: "cron", label: "Cron (סנכרון אוטומטי)", status: has("CRON_SECRET") ? "configured" : "missing", note: has("CRON_SECRET") ? "סוד מוגדר — נקודות הקצה מאובטחות" : "חסר CRON_SECRET — נקודות ה-cron מושבתות" },
    emailItem(),
    whatsappItem(),
    growItem(),
    { key: "social", label: "רשתות חברתיות", status: "missing", note: "לא מוגדר — מאגר טוקנים עתידי (social_connection_vault)" },
  ];
}

// Email = the REAL Resend transport (notify/providers.ts reads RESEND_API_KEY/RESEND_FROM).
// The legacy EMAIL_API_KEY/EMAIL_FROM are a dead no-op and are intentionally NOT checked here.
function emailItem(): ConfigItem {
  const key = has("RESEND_API_KEY");
  const from = has("RESEND_FROM");
  const status: ConfigStatus = key && from ? "configured" : key ? "partial" : "missing";
  return { key: "email", label: "אימייל (Resend)", status,
    note: key ? (from ? "מפתח וכתובת שולח מוגדרים" : "חסר RESEND_FROM — ברירת מחדל תשמש עד להגדרה") : "חסר RESEND_API_KEY — לא יישלחו אימיילים אמיתיים" };
}

// WhatsApp is connected PER-OFFICE in the DB (settings/whatsapp); these env vars are the
// platform-level fallback/verification. "configured" here = platform env present.
function whatsappItem(): ConfigItem {
  const parts = [has("WHATSAPP_ACCESS_TOKEN"), has("WHATSAPP_PHONE_NUMBER_ID"), has("WHATSAPP_APP_SECRET")];
  const n = parts.filter(Boolean).length;
  const status: ConfigStatus = n === 3 ? "configured" : n > 0 ? "partial" : "missing";
  return { key: "whatsapp", label: "WhatsApp", status,
    note: n === 0 ? "אין הגדרת פלטפורמה — חיבור WhatsApp מתבצע לכל משרד בנפרד בהגדרות" : `${n}/3 משתני פלטפורמה (token, phone-id, app-secret)` };
}

// GROW/Meshulam billing (grow-client.ts): needs a user id + at least one page code + api key.
function growItem(): ConfigItem {
  const user = has("GROW_USER_ID");
  const pageCode = has("GROW_PAGE_CODE") || has("GROW_RECURRING_PAGE_CODE");
  const apiKey = has("GROW_API_KEY");
  const status: ConfigStatus = user && pageCode && apiKey ? "configured" : (user || pageCode || apiKey) ? "partial" : "missing";
  return { key: "grow", label: "חיוב (GROW)", status,
    note: status === "configured" ? "מוגדר — אימות תשלום מתבצע מול השרת" : "חסרים משתני GROW (user-id / page-code / api-key) — חיוב לא פעיל" };
}
