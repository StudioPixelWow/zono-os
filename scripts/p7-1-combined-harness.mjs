// ============================================================================
// ZONO — P7.1 RPC COMPLETION · combined two-connection concurrency proof.
// Two REAL independent pg connections. Proves for BOTH property and seat:
//   (1) enforce_limit_lock serializes same org+limit, NOT different org/limit
//   (2) the guarded RPC admits EXACTLY ONE of two concurrent final-slot creates
//       (the other gets LIMIT_REACHED; never N+1; no partial write)
//   (3) seat-specific: duplicate-pending + invalid-email rejected atomically
// Self-cleaning (deletes only rows it created). Requires the combined setup DB.
//
//   DATABASE_URL="postgres://postgres@/p71combined?host=/tmp&port=54329" \
//     node scripts/p7-1-combined-harness.mjs
// ============================================================================
import pg from "pg";
const { Client } = pg;
const URL = process.env.DATABASE_URL;
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
if (!URL) { console.error("Set DATABASE_URL"); process.exit(2); }
const mk = () => new Client({ connectionString: URL });
let failed = 0;
const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) failed++; };
const keyOf = async (client, org, limit) => (await client.query("select hashtextextended($1||':'||$2,0) k", [org, limit])).rows[0].k;

(async () => {
  const A = mk(), B = mk();
  await A.connect(); await B.connect();
  try {
    // ══ SECTION 1 · lock serialization (shared by property + seat) ═══════════
    console.log("P7.1 · lock serialization (two live connections)");
    await A.query("begin");
    await A.query("select public.enforce_limit_lock($1,$2)", [ORG_A, "seats"]);
    const gotSame = (await B.query("select pg_try_advisory_xact_lock($1) g", [await keyOf(B, ORG_A, "seats")])).rows[0].g;
    ok(gotSame === false, "same org+limit (seats) → B blocked while A holds (serialized)");
    await B.query("rollback"); await B.query("begin");
    const gotOtherOrg = (await B.query("select pg_try_advisory_xact_lock($1) g", [await keyOf(B, ORG_B, "seats")])).rows[0].g;
    ok(gotOtherOrg === true, "different org, same limit → B acquires immediately (no false block)");
    const gotOtherLimit = (await B.query("select pg_try_advisory_xact_lock($1) g", [await keyOf(B, ORG_A, "monitoredListings")])).rows[0].g;
    ok(gotOtherLimit === true, "same org, different limit (monitoredListings) → B acquires immediately");
    await B.query("rollback"); await A.query("rollback");

    // ══ SECTION 2 · PROPERTY final-slot race (create_property_guarded) ═══════
    console.log("\nP7.1 · PROPERTY final-slot race (exactly one wins)");
    const pStart = (await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n;
    const pLimit = pStart + 1;
    await A.query("begin");
    const pAId = (await A.query("select public.create_property_guarded($1,$2,'{\"qa\":\"p7.1\"}'::jsonb,$3) id", [ORG_A, ORG_A, pLimit])).rows[0].id;
    const pB = (async () => {
      await B.query("begin");
      try { await B.query("select public.create_property_guarded($1,$2,'{}'::jsonb,$3)", [ORG_A, ORG_A, pLimit]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; }
      finally { await B.query("rollback"); }
    })();
    await new Promise((r) => setTimeout(r, 300));
    await A.query("commit");
    ok((await pB) === "limit", "concurrent 2nd property create → LIMIT_REACHED");
    const pAfter = (await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n;
    ok(pAfter === pLimit, `exactly one property added (usage=${pLimit}, never N+1) [got ${pAfter}]`);
    await A.query("delete from public.properties where id=$1", [pAId]);
    ok((await A.query("select count(*)::int n from public.properties where org_id=$1", [ORG_A])).rows[0].n === pStart, `cleanup: property ${pAId} removed`);

    // ══ SECTION 3 · SEAT final-slot race (create_invitation_guarded) ═════════
    console.log("\nP7.1 · SEAT final-slot race (exactly one invitation wins)");
    // usage = active users + pending invites. Baseline: 2 active users, 0 pending.
    const sBase = (await A.query(
      "select ((select count(*) from public.users where org_id=$1 and status='active')+(select count(*) from public.org_invitations where org_id=$1 and status='pending'))::int n",
      [ORG_A])).rows[0].n;
    const sLimit = sBase + 1; // one seat left
    await A.query("begin");
    const sAId = (await A.query(
      "select public.create_invitation_guarded($1,$2::jsonb,$3) id",
      [ORG_A, JSON.stringify({ email: "winner@zono.co.il", token: "tokwin", invited_by: null }), sLimit])).rows[0].id;
    const sB = (async () => {
      await B.query("begin");
      try { await B.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [ORG_A, JSON.stringify({ email: "loser@zono.co.il", token: "toklose" }), sLimit]); return "ok"; }
      catch (e) { return /LIMIT_REACHED/.test(e.message) ? "limit" : "err:" + e.message; }
      finally { await B.query("rollback"); }
    })();
    await new Promise((r) => setTimeout(r, 300));
    await A.query("commit");
    ok((await sB) === "limit", "concurrent 2nd invitation → LIMIT_REACHED (seat race)");
    const sPend = (await A.query("select count(*)::int n from public.org_invitations where org_id=$1 and status='pending'", [ORG_A])).rows[0].n;
    ok(sPend === 1, `exactly 1 pending invite after race (seat usage=${sLimit}, never ${sLimit + 1}) [got ${sPend}]`);

    // ══ SECTION 4 · SEAT invalid-input atomic rejections ═════════════════════
    console.log("\nP7.1 · SEAT invalid-input (atomic, no partial write)");
    // duplicate pending (same email as the winner, unlimited seats so only dup can block)
    const dup = await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [ORG_A, JSON.stringify({ email: "WINNER@zono.co.il", token: "tokdup" }), -1]).then(() => "ok").catch((e) => /DUPLICATE_PENDING/.test(e.message) ? "dup" : "err:" + e.message);
    ok(dup === "dup", "duplicate pending email (case-insensitive) → DUPLICATE_PENDING");
    const bad = await A.query("select public.create_invitation_guarded($1,$2::jsonb,$3)", [ORG_A, JSON.stringify({ email: "   ", token: "tokbad" }), -1]).then(() => "ok").catch((e) => /INVALID_EMAIL/.test(e.message) ? "invalid" : "err:" + e.message);
    ok(bad === "invalid", "empty email → INVALID_EMAIL");
    const afterBad = (await A.query("select count(*)::int n from public.org_invitations where org_id=$1 and status='pending'", [ORG_A])).rows[0].n;
    ok(afterBad === 1, `no partial writes from rejected inputs (still 1 pending) [got ${afterBad}]`);

    // cleanup seat rows this harness created
    await A.query("delete from public.org_invitations where org_id=$1 and token in ('tokwin','toklose','tokdup','tokbad')", [ORG_A]);
    ok((await A.query("select count(*)::int n from public.org_invitations where org_id=$1", [ORG_A])).rows[0].n === 0, "cleanup: harness invitations removed");
  } finally { await A.end(); await B.end(); }
  console.log("");
  if (failed === 0) console.log("ALL CHECKS PASSED — real two-connection proof (property + seat)");
  else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
