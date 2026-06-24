/**
 * Boot-time environment validation + integration config detection.
 *
 * `assertCoreEnv()` fails fast at server startup (via instrumentation) with one
 * aggregated, human-readable error listing every missing P0 variable — instead
 * of a confusing failure deep inside the Supabase SDK on the first query.
 *
 * `getIntegrationStatus()` is non-throwing: it reports which optional
 * integrations are configured so the UI can show a "setup needed" state rather
 * than crashing or pretending a provider is connected.
 */

/** Placeholders shipped in .env.example — treated as "not configured". */
const PLACEHOLDERS = new Set([
  "https://your-project-ref.supabase.co",
  "your-anon-key",
  "your-service-role-key",
  "",
]);

function isReal(value: string | undefined): boolean {
  return !!value && !PLACEHOLDERS.has(value.trim());
}

/** The three P0 variables the app cannot run without. */
const CORE_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Throw a single clear error if any P0 Supabase variable is missing/placeholder.
 * Call once at boot (instrumentation). Safe to call repeatedly.
 */
export function assertCoreEnv(): void {
  const missing = CORE_VARS.filter((name) => !isReal(process.env[name]));
  if (missing.length === 0) return;
  throw new Error(
    [
      "",
      "❌ ZONO cannot start — required environment variables are missing:",
      ...missing.map((n) => `   • ${n}`),
      "",
      "Set them in your hosting provider's env settings (or .env.local for local dev).",
      "See .env.example for the full list. The three above are mandatory.",
      "",
    ].join("\n"),
  );
}

export type IntegrationKey = "openai" | "gemini" | "apify" | "meta" | "whatsapp" | "image";
export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  configured: boolean;
  /** What is unavailable while this is not configured (degrades, never crashes). */
  note: string;
}

/**
 * Non-throwing detection of optional integration configuration. Used by admin
 * UI to show setup state. Never blocks the app — every integration has a
 * graceful fallback (deterministic output / manual flow / empty data).
 */
export function getIntegrationStatus(): IntegrationStatus[] {
  const has = (v: string | undefined) => isReal(v);
  return [
    {
      key: "openai",
      label: "OpenAI",
      configured: has(process.env.OPENAI_API_KEY),
      note: "ללא מפתח — קופי/ניתוח שיווקי עוברים ללוגיקה דטרמיניסטית.",
    },
    {
      key: "gemini",
      label: "Gemini",
      configured: has(process.env.GEMINI_API_KEY),
      note: "ללא מפתח — ספק הקריאייטיב נופל ל-OpenAI ואז ל-mock.",
    },
    {
      key: "image",
      label: "ספק תמונות (Nano Banana / OpenAI)",
      configured: has(process.env.ZONO_IMAGE_PROVIDER) || has(process.env.VISUAL_PROVIDER) || has(process.env.GEMINI_API_KEY) || has(process.env.OPENAI_API_KEY),
      note: "ללא מפתח — קריאייטיב מחזיר Prompt + render object, ללא תמונה סופית.",
    },
    {
      key: "apify",
      label: "Apify (עסקאות / מודעות חיצוניות)",
      configured: has(process.env.APIFY_TOKEN),
      note: "ללא טוקן — אין משיכת נתוני שוק חיים; הדפים נטענים ריקים.",
    },
    {
      key: "meta",
      label: "Meta / Facebook API",
      configured: has(process.env.META_ACCESS_TOKEN) || has(process.env.META_APP_ID),
      note: "לא מחובר — הפצה ומדדי ביצוע ידניים (מסייע פרסום).",
    },
    {
      key: "whatsapp",
      label: "WhatsApp Business API",
      configured: has(process.env.WHATSAPP_ACCESS_TOKEN) || has(process.env.WHATSAPP_PHONE_NUMBER_ID),
      note: "לא מחובר — אינבוקס/שליחה ידניים (מסייע WhatsApp).",
    },
  ];
}
