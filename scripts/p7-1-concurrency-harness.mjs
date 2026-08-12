// ============================================================================
// ZONO — P7.1 two-connection concurrency harness (REAL two independent DB
// connections). Proves enforce_limit_lock serializes same org+limit, does NOT
// serialize different org / different limit, and that create_property_guarded
// admits EXACTLY ONE of two concurrent final-slot creates (never N+1).
//
// This must be run OUTSIDE the single-session SQL tool — it opens two real pg
// connections. Cloud MCP cannot do this (no second connection / no superuser
// password), which is why P7.1 delivers this harness for you to execute.
//
// Usage:
//   DATABASE_URL="postgres://…"  ORG_A="<uuid>"  ORG_B="<uuid>"  node scripts/p7-1-concurrency-harness.mjs
// Requires the P7.1 atomic RPC migration applied (create_property_guarded).
// All writes happen inside transactions that are ROLLED BACK — no residue.
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const ORG_A = process.env.ORG_A, ORG_B = process.env.ORG_B;
if (!URL || !ORG_A || !ORG_B) { console.error("Set DATABASE_URL, ORG_A, ORG_B"); process.exit(2); }

const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryLock(client, org, key, timeoutMs) {
  // returns true if acquired within timeout, false if it blocked out
  await client.query("begin");
  await client.query(`set local lock_timeout = '${timeoutMs}ms'`);
  try { await client.query("select public.enforce_limit_lock($1,$2)", [org, key]); return true; }
  catch (e) { if (/lock timeout|canceling statement/i.test(e.message)) return false; throw e; }
}

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    console.log("P7.1 · same org + same limit → B BLOCKS while A holds");
    await A.query("begin");
    await A.query("select public.enforce_limit_lock($1,$2)", [ORG_A, "seats"]); // A holds (xact)
    const bBlocked = !(await tryLock(B, ORG_A, "seats", 800));                    // B tries same key
    ok(bBlocked, "B could NOT acquire same org+limit while A holds (serialized)");
    await B.query("rollback");

    console.log("\nP7.1 · different org → NO block");
    const bDiffOrg = await tryLock(B, ORG_B, "seats", 800);
    ok(bDiffOrg, "B acquired different-org lock immediately (no false serialization)");
    await B.query("rollback");

    console.log("\nP7.1 · same org + different limit → NO block");
    const bDiffKey = await tryLock(B, ORG_A, "monitoredListings", 800);
    ok(bDiffKey, "B acquired same-org DIFFERENT-limit lock immediately");
    await B.query("rollback");

    await A.query("rollback"); // release A's lock

    console.log("\nP7.1 · boundary: two concurrent final-slot creates → exactly ONE wins");
    // Simulate limit = current+1 so exactly one of two concurrent creates fits.
    const { rows } = await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A]);
    const limit = rows[0].n + 1;
    // Fire both guarded creates concurrently, each in its own transaction, rolled back after.
    const attempt = async (c) => {
      await c.query("begin");
      try { await c.query("select public.create_property_guarded($1,$2,'{}'::jsonb,$3)", [ORG_A, ORG_A, limit]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; }
    };
    const [r1, r2] = await Promise.all([attempt(A), attempt(B)]);
    await A.query("rollback"); await B.query("rollback");
    const wins = [r1, r2].filter((r) => r === "ok").length;
    const blocks = [r1, r2].filter((r) => r === "limit").length;
    ok(wins === 1 && blocks === 1, `exactly one create succeeded, one got LIMIT_REACHED [${r1}, ${r2}]`);
    ok(!/err:/.test(r1 + r2), "no unexpected error / no partial write (both txns rolled back)");
  } finally {
    await A.end(); await B.end();
  }
  console.log("");
  if (failed === 0) console.log("ALL CHECKS PASSED (real two-connection proof)");
  else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
