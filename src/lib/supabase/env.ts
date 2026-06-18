/**
 * Centralised, validated access to Supabase environment variables.
 * Throwing here gives a clear error instead of a confusing runtime failure
 * deep inside the Supabase SDK.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. ` +
        `Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

/** Public values — safe to expose to the browser. */
export const supabasePublicEnv = {
  url: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
  anonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
};

/** Server-only secret — never import this into a client component. */
export const supabaseServiceRoleKey = () =>
  required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

/** Placeholder values shipped in .env.example — treated as "not configured". */
const PLACEHOLDERS = new Set([
  "https://your-project-ref.supabase.co",
  "your-anon-key",
  "your-service-role-key",
]);

function isReal(value: string | undefined): boolean {
  return !!value && !PLACEHOLDERS.has(value);
}

/**
 * Non-throwing check for whether public Supabase env vars are present and real
 * (not the .env.example placeholders). Lets callers fall back to mock data
 * instead of crashing when Supabase isn't configured yet.
 */
export function isSupabaseConfigured(): boolean {
  return (
    isReal(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isReal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/**
 * Server-only: whether the service-role key is also present and real. Required
 * for the pre-auth server read path used by repositories.
 */
export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && isReal(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
