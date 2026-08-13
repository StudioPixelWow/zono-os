// ============================================================================
// ZONO — P7.2C operatingAreas atomic enforcement · two-connection proof.
// Two REAL connections against the byte-identical deployed guarded RPC.
// Pixel usage starts at 1, limit 5. Proves: below-limit success, final-slot
// exactly-one/never-N+1, over-limit LIMIT_REACHED, concurrent DIFFERENT-area
// race (one wins/one blocked), concurrent SAME-area (idempotent, no double
// consume, no dup row, no false block), cross-org isolation, failure rollback.
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const PIXEL = "0f1825d2-0ac8-45d1-b03c-50ce9e9366a2";
const REMAX = "1a1e7da6-bb85-420a-978a-7deb8c35e63f";
const U1 = "11111111-1111-1111-1111-111111111111"; // pixel user
const RU = "22222222-2222-2222-2222-222222222222"; // remax user
const LIMIT = 5;
const loc = (n) => `aaaaaaaa-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(2); }
const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const usage = async (c, org) => (await c.query("select count(*)::int n from public.user_operating_localities where organization_id=$1", [org])).rows[0].n;
const add = (c, user, org, locality) => c.query("select public.create_operating_area_guarded($1,$2,$3,$4::jsonb,$5) id", [user, org, locality, JSON.stringify({ city_name: "עיר " + locality }), LIMIT]);

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    console.log(`P7.2C · operatingAreas (limit=${LIMIT}, start usage=${await usage(A, PIXEL)})`);
    // below-limit: add L2 (usage 1→2)
    await add(A, U1, PIXEL, loc(2));
    ok((await usage(A, PIXEL)) === 2, "below-limit add → success (usage 2/5)");
    // re-add L2 (same user+locality) → idempotent update, NO new unit
    await add(A, U1, PIXEL, loc(2));
    ok((await usage(A, PIXEL)) === 2, "re-add same area → idempotent, consumes no new unit (still 2)");
    // fill to limit: L3,L4,L5 (usage → 5)
    await add(A, U1, PIXEL, loc(3)); await add(A, U1, PIXEL, loc(4)); await add(A, U1, PIXEL, loc(5));
    ok((await usage(A, PIXEL)) === 5, "at-limit: usage = 5/5");
    // over-limit: L6 → LIMIT_REACHED, no row
    const over = await add(A, U1, PIXEL, loc(6)).then(() => "ok").catch((e) => /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message);
    ok(over === "limit", "over-limit add → LIMIT_REACHED");
    ok((await usage(A, PIXEL)) === 5, "rejected add wrote NO row (usage still 5)");

    // reset to usage 4 for concurrency (delete L5)
    await A.query("delete from public.user_operating_localities where organization_id=$1 and locality_id=$2", [PIXEL, loc(5)]);
    ok((await usage(A, PIXEL)) === 4, "reset to usage 4/5 for concurrency");
    // ── concurrency: two DIFFERENT areas at the final slot ──
    console.log("P7.2C · concurrency — two DIFFERENT areas, one final slot");
    await A.query("begin");
    await add(A, U1, PIXEL, loc(7));
    const bDiff = (async () => { await B.query("begin");
      try { await add(B, U1, PIXEL, loc(8)); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; } finally { await B.query("rollback"); } })();
    await new Promise((r) => setTimeout(r, 300)); await A.query("commit");
    ok((await bDiff) === "limit", "concurrent 2nd DIFFERENT area → LIMIT_REACHED");
    ok((await usage(A, PIXEL)) === 5, "final usage = 5, never 6 (no over-admit)");

    // ── concurrent SAME area (duplicate) ──
    console.log("P7.2C · concurrency — two SAME area requests (duplicate semantics)");
    // reset usage to 4 (delete L7)
    await A.query("delete from public.user_operating_localities where organization_id=$1 and locality_id=$2", [PIXEL, loc(7)]);
    const dupLoc = loc(9);
    await A.query("begin");
    await add(A, U1, PIXEL, dupLoc);                 // A inserts L9 (usage 4→5)
    const bSame = (async () => { await B.query("begin");
      try { await add(B, U1, PIXEL, dupLoc); return "ok"; }   // B same (user,L9) → should update, not consume
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; } finally { await B.query("commit"); } })();
    await new Promise((r) => setTimeout(r, 300)); await A.query("commit");
    const bres = await bSame;
    ok(bres === "ok", "concurrent SAME area → 2nd request succeeds (idempotent update, not blocked)");
    ok((await usage(A, PIXEL)) === 5, "SAME area consumed exactly ONE unit (usage 5, not 6)");
    ok((await A.query("select count(*)::int n from public.user_operating_localities where user_id=$1 and locality_id=$2", [U1, dupLoc])).rows[0].n === 1, "exactly ONE row for the duplicated (user,locality) — no dup corruption");

    // ── cross-org isolation ──
    console.log("P7.2C · cross-org isolation");
    const rStart = await usage(A, REMAX);
    await add(A, RU, REMAX, loc(1)); // RE/MAX add (its own locality) — Pixel at 5 must not block
    ok((await usage(A, REMAX)) === rStart + 1, "RE/MAX add succeeds while Pixel is at cap (usage counted separately)");
    ok((await usage(A, PIXEL)) === 5, "RE/MAX add did NOT change Pixel usage (no cross-org counting)");
    await A.query("begin"); await A.query("select public.enforce_limit_lock($1,'operatingAreas')", [PIXEL]);
    const rmLock = (await B.query("select pg_try_advisory_xact_lock(hashtextextended($1||':operatingAreas',0)) g", [REMAX])).rows[0].g;
    ok(rmLock === true, "Pixel operatingAreas lock does NOT block RE/MAX (no cross-org lock collision)");
    await A.query("rollback");
  } finally { await A.end(); await B.end(); }
  console.log("");
  console.log(failed === 0 ? "ALL P7.2C CHECKS PASSED (real two-connection, deployed guard, real limit)" : `${failed} CHECK(S) FAILED`);
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
