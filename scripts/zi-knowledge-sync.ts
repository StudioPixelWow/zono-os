/**
 * Seed/refresh the built-in ZI knowledge base in Supabase. Idempotent; preserves
 * custom org articles. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * in the environment (run locally or in CI, NOT in the browser).
 *
 * Run: npx tsx scripts/zi-knowledge-sync.ts
 */
async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("✗ Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  // Dynamic import so the server-only module loads only when env is present.
  const { syncZIKnowledgeBase } = await import("../src/lib/zi-expert/knowledge-sync");
  const res = await syncZIKnowledgeBase();
  console.log("ZI knowledge sync:", res);
  if (!res.ok) process.exit(1);
  console.log(`✅ inserted ${res.inserted} · updated ${res.updated} · unchanged ${res.unchanged} · chunks ${res.chunks}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
