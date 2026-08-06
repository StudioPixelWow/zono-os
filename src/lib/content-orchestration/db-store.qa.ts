/**
 * DB-backed OrchestrationStore contract tests (against the in-memory StoreClient).
 *   npx tsx src/lib/content-orchestration/db-store.qa.ts
 * Proves org isolation, idempotent retry, optimistic locking, generation
 * preserved after publish failure, and no duplicate publication — through the
 * real CreativeContentService over DbOrchestrationStore.
 */
import { CreativeContentService } from "./creative-content-service";
import { DbOrchestrationStore } from "./supabase-orchestration-store";
import { InMemoryStoreClient, OptimisticLockConflict } from "./store-client";
import { MockPublishingProvider } from "../creative-studio/publishing-provider";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }
async function throws(n: string, fn: () => unknown, kind?: new (...a: never[]) => Error) {
  try { await fn(); failures.push(n + " (no throw)"); console.error("  x " + n); }
  catch (e) { if (kind && !(e instanceof kind)) { failures.push(n + " wrong err"); console.error("  x " + n); } else passed++; }
}

const mockImage = { name: "mock", async generate() { return { provider: "mock", model: "gpt-image-2", images: [{ b64: "AA==", mime: "image/png" }], durationMs: 0 }; } };
function svc(client: InMemoryStoreClient) {
  let n = 0;
  return new CreativeContentService({ store: new DbOrchestrationStore(client), image: mockImage, publisher: new MockPublishingProvider(), ids: () => `o${++n}`, now: () => "2026-01-01T00:00:00Z" });
}
const A = { orgId: "orgA", userId: "uA" };
const B = { orgId: "orgB", userId: "uB" };

async function main() {
  console.log("Creative-Studio — DB-backed Store Contract Tests");
  const client = new InMemoryStoreClient();
  const s = svc(client);

  const readStore = new DbOrchestrationStore(client);
  const o = await s.generate(A, { idempotencyKey: "k1", contentItemId: "c1", kind: "property_ad_post", prompt: "p" });
  ok("output persisted via DB store", (await readStore.getOutput("orgA", o.id)) !== null);
  ok("usage persisted", (await client.selectMany("usage_events", { org_id: "orgA" })).length === 1);
  ok("lineage columns persisted", (await client.selectOne<Record<string, unknown>>("zono_quick_creative_outputs", { org_id: "orgA", id: o.id }))!.generation_round === 1);

  // idempotent retry returns existing output, no duplicate row
  const o2 = await s.generate(A, { idempotencyKey: "k1", contentItemId: "c1", kind: "property_ad_post", prompt: "p" });
  ok("idempotent generation (DB)", o2.id === o.id && (await client.selectMany("zono_quick_creative_outputs", { org_id: "orgA" })).length === 1);

  // organization isolation: Beta cannot read Alpha output by direct id
  ok("Beta cannot read Alpha output", (await new DbOrchestrationStore(client).getOutput("orgB", o.id)) === null);

  // approve → publish → publication persisted, output published
  await s.approve(A, o.id);
  const pub = await s.publish(A, o.id, "instagram", "premium_clean");
  ok("publication persisted + confirmed", pub.publication.status === "published" && !!pub.result.providerConfirmationId);
  ok("publication org-isolated", (await new DbOrchestrationStore(client).getPublication("orgB", o.id, "instagram")) === null);

  // idempotent publish: no duplicate publication row
  await s.publish(A, o.id, "instagram", "premium_clean");
  ok("no duplicate publication", (await client.selectMany("creative_publications", { org_id: "orgA", output_id: o.id })).length === 1);

  // cross-org publish denied
  await throws("cross-org publish denied", () => s.publish(B, o.id, "instagram", "premium_clean"));

  // optimistic locking on checked state update
  const store = new DbOrchestrationStore(client);
  await throws("stale version rejected", () => store.updateOutputStateChecked("orgA", o.id, "archived", 999), OptimisticLockConflict);
  await store.updateOutputStateChecked("orgA", o.id, "archived", 1);
  ok("correct version updates", (await store.getOutput("orgA", o.id))!.state === "archived");

  // generation preserved after a publish permanent failure (separate output)
  const o3 = await s.generate(A, { idempotencyKey: "k3", contentItemId: null, kind: "property_ad_post", prompt: "p" });
  await s.approve(A, o3.id);
  const pub3 = await s.publish(A, o3.id, "ig:permanent", "v"); // marker → permanent failure
  ok("publish permanent failure surfaced", pub3.result.status === "failed_permanent");
  ok("generation preserved after publish failure", (await store.getOutput("orgA", o3.id)) !== null);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL DB-STORE CONTRACT TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
