/**
 * Next.js instrumentation — runs once when the server process boots.
 * Fails fast (with a human-readable error) if the mandatory P0 environment
 * variables are missing, so misconfiguration surfaces at startup instead of
 * mid-request. Only runs on the Node.js server runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertCoreEnv } = await import("@/lib/env-validation");
    assertCoreEnv();
  }
}
