// ============================================================================
// ✅ ZONO Platform Persistence — pure self-tests (offline). 34.2.
// Validates the deterministic core helpers used by cache/snapshot/memory/ask
// repositories. No I/O. Runnable via the /tmp offline harness.
// ============================================================================
import { buildCacheKey, ttlToExpiry, isExpired, freshnessSeconds, normConfidence, assertOrgScoped } from "./core";

export interface PPCheck { name: string; pass: boolean; detail: string }
export interface PPSelfCheck { ok: boolean; total: number; passed: number; checks: PPCheck[] }

export function runSelfCheck(): PPSelfCheck {
  const checks: PPCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const NOW = Date.parse("2026-07-03T12:00:00.000Z");

  add("buildCacheKey joins + normalizes + drops empties",
    buildCacheKey(["AI Home", null, 42, "  Tel Aviv "]) === "ai_home:42:tel_aviv");
  add("buildCacheKey stable + order-sensitive",
    buildCacheKey(["a", "b"]) === "a:b" && buildCacheKey(["b", "a"]) === "b:a");

  add("ttlToExpiry positive → future ISO",
    ttlToExpiry(3600, NOW) === new Date(NOW + 3600_000).toISOString());
  add("ttlToExpiry null/zero/neg → no expiry",
    ttlToExpiry(null, NOW) === null && ttlToExpiry(0, NOW) === null && ttlToExpiry(-5, NOW) === null);

  add("isExpired past → true",
    isExpired(new Date(NOW - 1000).toISOString(), NOW) === true);
  add("isExpired future → false",
    isExpired(new Date(NOW + 1000).toISOString(), NOW) === false);
  add("isExpired null → never expires",
    isExpired(null, NOW) === false && isExpired(undefined, NOW) === false);

  add("freshnessSeconds computes age",
    freshnessSeconds(new Date(NOW - 90_000).toISOString(), NOW) === 90);
  add("freshnessSeconds invalid → null",
    freshnessSeconds("not-a-date", NOW) === null && freshnessSeconds(null, NOW) === null);
  add("freshnessSeconds never negative",
    freshnessSeconds(new Date(NOW + 5000).toISOString(), NOW) === 0);

  add("normConfidence clamps 0..1", normConfidence(0.5) === 0.5 && normConfidence(1.4) === 1 && normConfidence(-2) === 0);
  add("normConfidence rescales 0..100", normConfidence(80) === 0.8);
  add("normConfidence null-safe", normConfidence(null) === null && normConfidence(undefined) === null);

  let threw = false;
  try { assertOrgScoped("  "); } catch { threw = true; }
  add("assertOrgScoped throws on empty org", threw);
  let ok = false;
  try { assertOrgScoped("org-123"); ok = true; } catch { ok = false; }
  add("assertOrgScoped passes on real org", ok);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
