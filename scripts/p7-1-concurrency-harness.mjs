// ============================================================================
// ZONO — P7.1 two-connection concurrency harness (REAL two independent DB
// connections). Proves enforce_limit_lock serializes same org+limit, does NOT
// serialize different org / different limit, and that create_property_guarded
// admits EXACTLY ONE of two concurrent final-slot creates (never N+1).
//
// Runs OUTSIDE the single-session SQL tool with two real pg connections.
// Serialization is proven with pg_try_advisory_xact_lock (non-blocking: returns
// false while the other connection holds the key). The final-slot test creates
// ONE clearly-marked property, proves the second attempt gets LIMIT_REACHED,
// then DELETES the marked row (self-cleaning; exact id printed).
//
// Usage:
//   DATABASE_URL="postgres://…" ORG_A="<uuid>" ORG_B="<uuid>" node scripts/p7-1-concurrency-harness.mjs
// Requires the P7.1 atomic RPC migration applied.
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const ORG_A = process.env.ORG_A, ORG_B = process.env.ORG_B;
if (!URL || !ORG_A || !ORG_B) { console.error("Set DATABASE_URL, ORG_A, ORG_B"); process.exit(2); }
const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const keyOf = async (client, org, limit) => (await client.query("select hashtextextended($1||':'||$2,0) k", [org, limit])).rows[0].k;

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    // ── CASE A/B/C: lock contention via a second real connection ──
    console.log("P7.1 · lock serialization (two connections)");
    await A.query("begin");
    await A.query("select public.enforce_limit_lock($1,$2)", [ORG_A, "seats"]); // A holds seats:ORG_A (xact)
    const kSame = await keyOf(B, ORG_A, "seats");
    const kOtherOrg = await keyOf(B, ORG_B, "seats");
    const kOtherLimit = await keyOf(B, ORG_A, "monitoredListings");
    const gotSame = (await B.query("select pg_try_advisory_xact_lock($1) g", [kSame])).rows[0].g;
    ok(gotSame === false, "CASE A: B CANNOT acquire same org+limit while A holds (serialized)");
    await B.query("rollback"); await B.query("begin");
    const gotOtherOrg = (await B.query("select pg_try_advisory_xact_lock($1) g", [kOtherOrg])).rows[0].g;
    ok(gotOtherOrg === true, "CASE B: different org + same limit → B acquires immediately (no false block)");
    const gotOtherLimit = (await B.query("select pg_try_advisory_xact_lock($1) g", [kOtherLimit])).rows[0].g;
    ok(gotOtherLimit === true, "CASE C: same org + different limit → B acquires immediately");
    await B.query("rollback");
    await A.query("rollback"); // release A

    // ── FINAL-SLOT: two concurrent creates for the last slot ──
    console.log("\nP7.1 · final-slot race (limit = usage+1 → exactly one wins)");
    const start = (await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n;
    const limit = start + 1;
    // A takes the slot in a held transaction (lock held until commit)
    await A.query("begin");
    const aId = (await A.query("select public.create_property_guarded($1,$2,'{\"qa\":\"p7.1\"}'::jsonb,$3) id", [ORG_A, ORG_A, limit])).rows[0].id;
    // B attempts concurrently — it will BLOCK on A's advisory lock; commit A to let B proceed
    const bPromise = (async () => {
      await B.query("begin");
      try { await B.query("select public.create_property_guarded($1,$2,'{}'::jsonb,$3)", [ORG_A, ORG_A, limit]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; }
      finally { await B.query("rollback"); }
    })();
    await new Promise((r) => setTimeout(r, 300)); // ensure B is queued on the lock
    await A.query("commit");                       // A's property persists → usage now = limit
    const bResult = await bPromise;
    ok(bResult === "limit", `B (2nd create) received LIMIT_REACHED [${bResult}]`);
    const after = (await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n;
    ok(after === limit, `final usage = ${limit} (exactly one added), never N+1 [got ${after}]`);
    // cleanup the one QA property A created
    await A.query("delete from public.properties where id=$1", [aId]);
    const cleaned = (await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n;
    ok(cleaned === start, `cleanup: QA property ${aId} deleted, usage back to ${start}`);
  } finally { await A.end(); await B.end(); }
  console.log("");
  if (failed === 0) console.log("ALL CHECKS PASSED (real two-connection proof)");
  else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
