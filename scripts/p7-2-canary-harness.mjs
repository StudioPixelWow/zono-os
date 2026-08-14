// ============================================================================
// ZONO — P7.2 Pixel canary boundary + concurrency proof, on an exact prod-mirror
// of Pixel's state (seats usage=1/limit=5, listings usage=14/limit=30), using the
// byte-identical deployed RPCs. Two REAL connections. Proves, at the ACTUAL pilot
// limits: below-limit success, at-limit success, over-limit LIMIT_REACHED,
// exactly-one final-slot under concurrency (never N+1), no partial write,
// exactly-one row per success, and Org-A↔Org-B (Pixel↔RE/MAX) isolation.
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const PIXEL = "0f1825d2-0ac8-45d1-b03c-50ce9e9366a2";
const REMAX = "1a1e7da6-bb85-420a-978a-7deb8c35e63f";
const SEAT_LIMIT = 5, LISTING_LIMIT = 30;
if (!URL) { console.error("Set DATABASE_URL"); process.exit(2); }
const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const seatUsage = async (c, org) => (await c.query("select ((select count(*) from public.users where org_id=$1 and status='active')+(select count(*) from public.org_invitations where org_id=$1 and status='pending'))::int n", [org])).rows[0].n;
const listUsage = async (c, org) => (await c.query("select count(*)::int n from public.properties where org_id=$1", [org])).rows[0].n;
const inv = (email) => JSON.stringify({ email, token: "t_" + email, invited_by: null });

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    // ══ SEATS ══════════════════════════════════════════════════════════════
    console.log(`P7.2 · SEATS pilot boundary (limit=${SEAT_LIMIT}, start usage=${await seatUsage(A, PIXEL)})`);
    // below-limit: invite #2,3,4 succeed (usage 1→4)
    for (let i = 2; i <= 4; i++) await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [PIXEL, inv(`qa-seat-${i}@zono-qa.local`), SEAT_LIMIT]);
    ok((await seatUsage(A, PIXEL)) === 4, "below-limit invites succeed (usage → 4/5)");
    // at-limit: the final allowed slot (usage 4→5) succeeds
    await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [PIXEL, inv("qa-seat-5@zono-qa.local"), SEAT_LIMIT]);
    ok((await seatUsage(A, PIXEL)) === 5, "at-limit final slot succeeds (usage = 5/5)");
    // over-limit: next invite → LIMIT_REACHED, no row
    const beforeOver = (await A.query("select count(*)::int n from public.org_invitations where org_id=$1", [PIXEL])).rows[0].n;
    const overRes = await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [PIXEL, inv("qa-seat-6@zono-qa.local"), SEAT_LIMIT]).then(() => "ok").catch((e) => /LIMIT_REACHED/.test(e.message) ? "limit" : "err");
    ok(overRes === "limit", "over-limit invite → LIMIT_REACHED");
    ok((await A.query("select count(*)::int n from public.org_invitations where org_id=$1", [PIXEL])).rows[0].n === beforeOver, "rejected invite wrote NO row (no partial)");
    // reset to usage 4 for concurrency test (delete the #5 invite)
    await A.query("delete from public.org_invitations where org_id=$1 and email='qa-seat-5@zono-qa.local'", [PIXEL]);
    // concurrency: usage=4, limit=5, two concurrent → exactly one wins
    console.log("P7.2 · SEATS concurrency (usage=4, two concurrent → one wins)");
    await A.query("begin");
    await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [PIXEL, inv("qa-seat-conc-A@zono-qa.local"), SEAT_LIMIT]);
    const seatB = (async () => { await B.query("begin");
      try { await B.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [PIXEL, inv("qa-seat-conc-B@zono-qa.local"), SEAT_LIMIT]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; } finally { await B.query("rollback"); } })();
    await new Promise((r) => setTimeout(r, 300)); await A.query("commit");
    ok((await seatB) === "limit", "concurrent 2nd seat → LIMIT_REACHED");
    ok((await seatUsage(A, PIXEL)) === 5, "final seat usage = 5, never 6 (no over-admit)");

    // ══ PROPERTIES ═════════════════════════════════════════════════════════
    console.log(`\nP7.2 · PROPERTIES pilot boundary (limit=${LISTING_LIMIT}, start usage=${await listUsage(A, PIXEL)})`);
    // below-limit: fill 14 → 29
    for (let i = 15; i <= 29; i++) await A.query("select public.create_property_slot_guarded($1,$1,$2)", [PIXEL, LISTING_LIMIT]);
    ok((await listUsage(A, PIXEL)) === 29, "below-limit creates succeed (usage → 29/30)");
    // at-limit: #30 succeeds
    await A.query("select public.create_property_slot_guarded($1,$1,$2)", [PIXEL, LISTING_LIMIT]);
    ok((await listUsage(A, PIXEL)) === 30, "at-limit final slot succeeds (usage = 30/30)");
    // over-limit: #31 → LIMIT_REACHED, no row
    const overP = await A.query("select public.create_property_slot_guarded($1,$1,$2)", [PIXEL, LISTING_LIMIT]).then(() => "ok").catch((e) => /LIMIT_REACHED/.test(e.message) ? "limit" : "err");
    ok(overP === "limit", "over-limit property → LIMIT_REACHED");
    ok((await listUsage(A, PIXEL)) === 30, "rejected create wrote NO row (usage still 30)");
    // reset to 29 for concurrency
    await A.query("delete from public.properties where id = (select id from public.properties where org_id=$1 and status='draft' order by created_at desc limit 1)", [PIXEL]);
    console.log("P7.2 · PROPERTIES concurrency (usage=29, two concurrent → one wins)");
    await A.query("begin");
    await A.query("select public.create_property_slot_guarded($1,$1,$2)", [PIXEL, LISTING_LIMIT]);
    const propB = (async () => { await B.query("begin");
      try { await B.query("select public.create_property_slot_guarded($1,$1,$2)", [PIXEL, LISTING_LIMIT]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; } finally { await B.query("rollback"); } })();
    await new Promise((r) => setTimeout(r, 300)); await A.query("commit");
    ok((await propB) === "limit", "concurrent 2nd property → LIMIT_REACHED");
    ok((await listUsage(A, PIXEL)) === 30, "final listing usage = 30, never 31 (no over-admit)");

    // ══ RE/MAX ISOLATION ═══════════════════════════════════════════════════
    console.log("\nP7.2 · RE/MAX isolation (Pixel at limit must not affect RE/MAX)");
    ok((await seatUsage(A, REMAX)) === 1 && (await listUsage(A, REMAX)) === 1, "RE/MAX usage unchanged (seats 1, listings 1)");
    // RE/MAX create with NO limit (SHADOW → app passes -1 unlimited) succeeds regardless of Pixel state
    await A.query("select public.create_property_slot_guarded($1,$1,$2)", [REMAX, -1]);
    ok((await listUsage(A, REMAX)) === 2, "RE/MAX create (unlimited/SHADOW) succeeds while Pixel is capped");
    // cross-org lock: Pixel listing lock does not block RE/MAX listing lock
    await A.query("begin"); await A.query("select public.enforce_limit_lock($1,'monitoredListings')", [PIXEL]);
    const rmLock = (await B.query("select pg_try_advisory_xact_lock(hashtextextended($1||':monitoredListings',0)) g", [REMAX])).rows[0].g;
    ok(rmLock === true, "Pixel listing lock does NOT block RE/MAX (no cross-org lock collision)");
    await A.query("rollback");
  } finally { await A.end(); await B.end(); }
  console.log("");
  console.log(failed === 0 ? "ALL P7.2 CANARY CHECKS PASSED (real two-connection, prod-mirror, real pilot limits)" : `${failed} CHECK(S) FAILED`);
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
