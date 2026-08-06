/**
 * Headless execution of the /creative-lab workspace + bulk flows — the SAME
 * logic the browser E2E drives, minus the DOM. Proves generation, role/active
 * gating, approval lifecycle, publish eligibility, idempotency, ORG ISOLATION,
 * and bulk partial-failure + idempotent re-run actually run against the real
 * CreativeContentService + guarded in-memory runtime. No Next server, no Docker.
 *   npx tsx src/lib/creative-runtime/lab-flows.qa.ts
 */
// The lab runtime guard requires the flag set and NO real provider/prod refs.
process.env.ZONO_CREATIVE_TEST_RUNTIME = "true";
delete process.env.OPENAI_API_KEY;
delete process.env.SUPABASE_PROJECT_REF;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.CREATIVE_PUBLISHING_PROVIDER;
if (process.env.NODE_ENV === "production") (process.env as Record<string, string | undefined>).NODE_ENV = "test";

import { resolveTestSession } from "./fixtures";
import { doGenerate, doTransition, doPublish, doBulk, listOutputs, worldFor } from "./lab-flows";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }

const alphaOwner = resolveTestSession("alpha-owner");
const alphaAgent = resolveTestSession("alpha-agent");
const alphaInactive = resolveTestSession("alpha-inactive");
const betaOwner = resolveTestSession("beta-owner");
const anon = resolveTestSession("anonymous");

async function main() {
  console.log("Creative-Studio — /creative-lab Headless Flow Execution");

  // ── session resolution ────────────────────────────────────────────────────
  ok("alpha-owner resolves to org-alpha owner", alphaOwner.orgId === "org-alpha" && alphaOwner.role === "owner" && alphaOwner.active);
  ok("alpha-inactive is inactive", alphaInactive.active === false);
  ok("beta-owner resolves to org-beta", betaOwner.orgId === "org-beta");
  ok("anonymous has no org", anon.orgId === null);

  // ── generation gating ─────────────────────────────────────────────────────
  ok("anonymous cannot generate", !(await doGenerate(anon, { kind: "property_ad_post", prompt: "x" })).ok);
  ok("inactive cannot generate", !(await doGenerate(alphaInactive, { kind: "property_ad_post", prompt: "x" })).ok);
  ok("empty prompt rejected", !(await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "   " })).ok);
  ok("unknown kind rejected", !(await doGenerate(alphaOwner, { kind: "not_a_kind", prompt: "x" })).ok);

  const g1 = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "בית פרטי A" });
  ok("generate → review", g1.ok && g1.output?.state === "review");
  for (const k of ["market_stat", "agent_brand", "office_brand", "sold_post"]) {
    const r = await doGenerate(alphaOwner, { kind: k, prompt: `kind ${k}` });
    ok(`generate kind ${k}`, r.ok && r.output?.kind === k);
  }
  // idempotency: identical (kind+prompt) → same output id, list count unchanged
  const before = listOutputs(alphaOwner).outputs!.length;
  const dup1 = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "מפתח כפילות" });
  const cntMid = listOutputs(alphaOwner).outputs!.length;
  const dup2 = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "מפתח כפילות" });
  ok("idempotent generate returns same id", dup1.output?.id === dup2.output?.id);
  ok("idempotent generate adds no duplicate", listOutputs(alphaOwner).outputs!.length === cntMid && cntMid === before + 1);

  // ── lifecycle + eligibility ───────────────────────────────────────────────
  const life = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "מחזור חיים" });
  const id = life.output!.id;
  ok("publish before approve blocked", !(await doPublish(alphaOwner, { outputId: id, platform: "instagram", variantKey: "v" })).ok);
  ok("schedule before approve blocked", !(await doTransition(alphaOwner, id, "schedule")).ok);
  ok("approve → approved", (await doTransition(alphaOwner, id, "approve")).output?.state === "approved");
  ok("approved → scheduled", (await doTransition(alphaOwner, id, "schedule")).output?.state === "scheduled");
  const pub = await doPublish(alphaOwner, { outputId: id, platform: "instagram", variantKey: "v" });
  ok("publish → published", pub.ok && pub.output?.state === "published");
  const pub2 = await doPublish(alphaOwner, { outputId: id, platform: "instagram", variantKey: "v" });
  ok("publish twice stays published (idempotent)", pub2.ok && pub2.output?.state === "published");

  const rej = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "לדחייה" });
  const rid = rej.output!.id;
  ok("reject → qa_failed", (await doTransition(alphaOwner, rid, "reject")).output?.state === "qa_failed");
  ok("qa_failed cannot be approved", !(await doTransition(alphaOwner, rid, "approve")).ok);

  // ── organization isolation ────────────────────────────────────────────────
  const aOnly = await doGenerate(alphaOwner, { kind: "property_ad_post", prompt: "בלעדי אלפא" });
  const aId = aOnly.output!.id;
  const betaList = listOutputs(betaOwner).outputs!;
  ok("beta cannot see alpha output", !betaList.some((o) => o.id === aId));
  ok("alpha-agent shares org with owner (sees output)", listOutputs(alphaAgent).outputs!.some((o) => o.id === aId));
  const bOnly = await doGenerate(betaOwner, { kind: "property_ad_post", prompt: "בלעדי ביתא" });
  ok("alpha cannot see beta output", !listOutputs(alphaOwner).outputs!.some((o) => o.id === bOnly.output!.id));
  ok("every alpha output is org-alpha scoped", listOutputs(alphaOwner).outputs!.every((o) => o.orgId === "org-alpha"));

  // ── bulk generator ────────────────────────────────────────────────────────
  const alphaProps = worldFor(alphaOwner).properties;
  const validIds = alphaProps.filter((p) => p.valid).map((p) => p.id);
  const invalidIds = alphaProps.filter((p) => !p.valid).map((p) => p.id);
  const bAll = await doBulk(alphaOwner, { propertyIds: [...validIds, ...invalidIds], kind: "property_ad_post" });
  ok("bulk totals add up", bAll.total === validIds.length + invalidIds.length && bAll.succeeded + bAll.failed === bAll.total);
  ok("bulk: valid rows succeed", validIds.every((pid) => bAll.rows.find((r) => r.propertyId === pid)?.ok));
  ok("bulk: invalid rows fail (partial failure, batch not aborted)", invalidIds.every((pid) => bAll.rows.find((r) => r.propertyId === pid)?.ok === false));
  ok("bulk: at least one success", bAll.succeeded >= 1);
  const bRe = await doBulk(alphaOwner, { propertyIds: validIds, kind: "property_ad_post" });
  ok("bulk re-run dedupes (idempotent, no duplicates)", bRe.rows.every((r) => r.deduped === true));
  ok("bulk re-run still succeeds all valid", bRe.succeeded === validIds.length);
  const betaBulk = await doBulk(betaOwner, { propertyIds: worldFor(betaOwner).properties.map((p) => p.id), kind: "property_ad_post" });
  ok("beta bulk scoped to beta property", betaBulk.total === worldFor(betaOwner).properties.length && betaBulk.succeeded >= 1);
  const cross = await doBulk(betaOwner, { propertyIds: validIds, kind: "property_ad_post" });
  ok("beta bulk rejects alpha property ids (org scope)", cross.rows.every((r) => r.ok === false));
  const mkt = await doBulk(alphaOwner, { propertyIds: validIds, kind: "market_stat" });
  ok("bulk market_stat kind runs", mkt.succeeded >= 1);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL /creative-lab HEADLESS FLOW TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
