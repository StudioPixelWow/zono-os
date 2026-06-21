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
    { key: "email", label: "אימייל", status: "missing", note: "לא מוגדר — אין כרגע אינטגרציית שליחת אימייל" },
    { key: "whatsapp", label: "WhatsApp", status: "missing", note: "לא מוגדר — אין כרגע מחבר WhatsApp" },
    { key: "social", label: "רשתות חברתיות", status: "missing", note: "לא מוגדר — מאגר טוקנים עתידי (social_connection_vault)" },
  ];
}
