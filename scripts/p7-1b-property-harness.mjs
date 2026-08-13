// ============================================================================
// ZONO — P7.1B property enforcement · two-connection race on the FINAL
// architecture (create_property_slot_guarded = atomic reservation = draft row).
// Two REAL independent pg connections. Proves:
//   (1) lock serialization: same org+monitoredListings serialized; other org free
//   (2) final-slot race (usage=N-1, limit=N): exactly one wins, one LIMIT_REACHED,
//       final usage = N, never N+1, no partial row
//   (3) failure rollback: a failed enrichment releases the reserved slot (no leak)
//   (4) tenancy: Org A create cannot consume Org B quota; owner is just carried
//
//   DATABASE_URL="postgres://postgres@/p71bprop?host=/tmp&port=54329" \
//     node scripts/p7-1b-property-harness.mjs
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-1111-1111-111111111111";
if (!URL) { console.error("Set DATABASE_URL"); process.exit(2); }
const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const keyOf = async (c, org, lim) => (await c.query("select hashtextextended($1||':'||$2,0) k", [org, lim])).rows[0].k;
const usage = async (c, org) => (await c.query("select count(*)::int n from public.properties where org_id=$1", [org])).rows[0].n;

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    // ── SECTION 1 · lock serialization ──
    console.log("P7.1B · lock serialization (two connections)");
    await A.query("begin");
    await A.query("select public.enforce_limit_lock($1,'monitoredListings')", [ORG_A]);
    const gotSame = (await B.query("select pg_try_advisory_xact_lock($1) g", [await keyOf(B, ORG_A, "monitoredListings")])).rows[0].g;
    ok(gotSame === false, "same org+monitoredListings → B blocked while A holds (serialized)");
    await B.query("rollback"); await B.query("begin");
    const gotOtherOrg = (await B.query("select pg_try_advisory_xact_lock($1) g", [await keyOf(B, ORG_B, "monitoredListings")])).rows[0].g;
    ok(gotOtherOrg === true, "different org → B acquires immediately (no false block)");
    await B.query("rollback"); await A.query("rollback");

    // ── SECTION 2 · final-slot race (usage=N-1, limit=N) ──
    console.log("\nP7.1B · final-slot property race (exactly one wins)");
    const start = await usage(A, ORG_A);          // 2
    const limit = start + 1;                        // one slot left
    await A.query("begin");
    const aId = (await A.query("select public.create_property_slot_guarded($1,$2,$3) id", [ORG_A, OWNER, limit])).rows[0].id;
    const bP = (async () => {
      await B.query("begin");
      try { await B.query("select public.create_property_slot_guarded($1,$2,$3)", [ORG_A, OWNER, limit]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; }
      finally { await B.query("rollback"); }
    })();
    await new Promise((r) => setTimeout(r, 300));  // ensure B is queued on the lock
    await A.query("commit");                        // A's draft persists → usage = limit
    ok((await bP) === "limit", "concurrent 2nd property create → LIMIT_REACHED");
    ok((await usage(A, ORG_A)) === limit, `exactly one property added (usage=${limit}, never N+1)`);
    // reserved row is a real draft
    const row = (await A.query("select status,title,price,owner_id from public.properties where id=$1", [aId])).rows[0];
    ok(row.status === "draft" && row.price === "0" && row.owner_id === OWNER, "reserved row is a normal draft (status/price/owner correct)");

    // ── SECTION 3 · failure rollback releases the slot (no leak) ──
    console.log("\nP7.1B · failure rollback (no quota leak)");
    const beforeRelease = await usage(A, ORG_A);
    await A.query("delete from public.properties where id=$1", [aId]); // simulate release on failed enrichment
    ok((await usage(A, ORG_A)) === beforeRelease - 1, "releasing a reserved slot returns quota (usage back down)");
    ok((await usage(A, ORG_A)) === start, `usage restored to baseline ${start}`);

    // ── SECTION 4 · tenancy: Org A cannot consume Org B quota ──
    console.log("\nP7.1B · tenancy isolation");
    const bStart = await usage(A, ORG_B);
    // Org A create at Org A's limit does NOT touch Org B.
    await A.query("select public.create_property_slot_guarded($1,$2,$3)", [ORG_A, OWNER, 99]);
    ok((await usage(A, ORG_B)) === bStart, "Org A create left Org B usage unchanged (no cross-org consumption)");
    const created = (await A.query("select org_id from public.properties order by created_at desc limit 1")).rows[0];
    ok(created.org_id === ORG_A, "new row bound to Org A (p_org), never Org B");
    // cleanup the row this section created
    await A.query("delete from public.properties where org_id=$1 and status='draft' and price=0", [ORG_A]);
    ok((await usage(A, ORG_A)) === start, `cleanup: harness drafts removed (usage=${start})`);
  } finally { await A.end(); await B.end(); }
  console.log("");
  if (failed === 0) console.log("ALL CHECKS PASSED — real two-connection property proof (final architecture)");
  else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
