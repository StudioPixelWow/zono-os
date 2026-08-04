/**
 * Shared storage contract — runs the SAME suite against both AssetStorage
 * implementations: LocalPrivateStorage and SupabasePrivateStorage (via a mock
 * Supabase storage client). No Docker.
 *   npx tsx src/lib/creative-studio/storage/storage-contract.qa.ts
 */
import { LocalPrivateStorage, StorageAuthError } from "../asset-storage";
import type { AssetStorage, AssetState, StoredAsset } from "../asset-storage";
import { SupabasePrivateStorage } from "./supabase-private-storage";
import type { SupabaseStorageClient, AssetMetaStore } from "./supabase-private-storage";

let passed = 0; const failures: string[] = [];
function ok(n: string, c: boolean) { if (c) passed++; else { failures.push(n); console.error("  x " + n); } }
async function throws(n: string, fn: () => unknown, kind?: new (...a: never[]) => Error) {
  try { await fn(); failures.push(n + " (no throw)"); console.error("  x " + n); }
  catch (e) { if (kind && !(e instanceof kind)) { failures.push(n + " wrong err"); console.error("  x " + n); } else passed++; }
}

// ── Mock Supabase storage client + meta store ────────────────────────────────
class MockSbStorage implements SupabaseStorageClient {
  objects = new Set<string>(); copies: string[] = []; failUpload = false;
  async upload(bucket: string, path: string, bytes: Uint8Array, ct: string) { void bytes; void ct; if (this.failUpload) return { error: { message: "injected" } }; this.objects.add(`${bucket}/${path}`); return { error: null }; }
  async createSignedUrl(bucket: string, path: string, ttl: number) { if (!this.objects.has(`${bucket}/${path}`)) return { signedUrl: null, error: { message: "not found" } }; return { signedUrl: `https://sb/${bucket}/${path}?exp=${ttl}`, error: null }; }
  async copy(bucket: string, from: string, to: string) { this.copies.push(`${to}`); return { error: null }; }
  async remove(bucket: string, path: string) { this.objects.delete(`${bucket}/${path}`); return { error: null }; }
  async exists(bucket: string, path: string) { return this.objects.has(`${bucket}/${path}`); }
}
class MemMeta implements AssetMetaStore {
  m = new Map<string, StoredAsset>();
  key(o: string, p: string) { return `${o}:${p}`; }
  async get(o: string, p: string) { return this.m.get(this.key(o, p)) ?? null; }
  async put(a: StoredAsset) { this.m.set(this.key(a.orgId, a.path), a); }
  async setState(o: string, p: string, s: AssetState) { const a = this.m.get(this.key(o, p)); if (a) this.m.set(this.key(o, p), { ...a, state: s }); }
}

const alpha = { orgId: "orgA", userId: "uA", active: true };
const beta = { orgId: "orgB", userId: "uB", active: true };
const anon = { orgId: null, userId: null, active: false };
const inactive = { orgId: "orgA", userId: "uA", active: false };

/** The shared contract — identical assertions for any AssetStorage. */
async function runContract(label: string, st: AssetStorage) {
  await st.putPrivateAsset("orgA", "uA", "orgA/creative/o1/master.png", new Uint8Array([1, 2, 3]), "draft");
  ok(`${label}: owner owns asset`, (await st.verifyAssetOwnership(alpha, "orgA/creative/o1/master.png")) === true);
  ok(`${label}: other org not owner`, (await st.verifyAssetOwnership(beta, "orgA/creative/o1/master.png")) === false);
  ok(`${label}: signed read for owner`, (await st.createSignedRead(alpha, "orgA/creative/o1/master.png", 60000)).token.length > 0);
  await throws(`${label}: anonymous denied`, () => st.createSignedRead(anon, "orgA/creative/o1/master.png", 60000), StorageAuthError);
  await throws(`${label}: inactive denied`, () => st.createSignedRead(inactive, "orgA/creative/o1/master.png", 60000), StorageAuthError);
  await throws(`${label}: cross-org denied`, () => st.createSignedRead(beta, "orgA/creative/o1/master.png", 60000), StorageAuthError);
  await throws(`${label}: arbitrary path denied`, () => st.createSignedRead(alpha, "orgB/x/master.png", 60000), StorageAuthError);
  // lifecycle: qa_failed not externally signable
  await st.putPrivateAsset("orgA", "uA", "orgA/creative/o2/master.png", new Uint8Array([4]), "qa_failed");
  await throws(`${label}: qa_failed not signable`, () => st.createSignedRead(alpha, "orgA/creative/o2/master.png", 60000), StorageAuthError);
  // promotion: approved only, master retained
  await st.putPrivateAsset("orgA", "uA", "orgA/creative/o3/master.png", new Uint8Array([5]), "approved");
  const promo = await st.promoteApprovedAsset(alpha, "orgA/creative/o3/master.png");
  ok(`${label}: approved promoted`, promo.masterPath === "orgA/creative/o3/master.png" && promo.publicationRef.length > 0);
  await throws(`${label}: draft not promotable`, () => st.promoteApprovedAsset(alpha, "orgA/creative/o1/master.png"), StorageAuthError);
  // master still private/available to owner after promotion
  ok(`${label}: master retained after promotion`, (await st.verifyAssetOwnership(alpha, "orgA/creative/o3/master.png")) === true);
}

async function main() {
  console.log("Creative-Studio — Shared Storage Contract (Local + Supabase mock)");
  await runContract("Local", new LocalPrivateStorage("secret", () => 1000));
  await runContract("Supabase", new SupabasePrivateStorage(new MockSbStorage(), new MemMeta()));
  // Supabase-only: MIME/extension/size validation
  const st = new SupabasePrivateStorage(new MockSbStorage(), new MemMeta());
  await throws("Supabase: bad extension rejected", () => st.putPrivateAsset("orgA", "uA", "orgA/creative/x/master.gif", new Uint8Array([1]), "draft"), StorageAuthError);
  await throws("Supabase: oversize rejected", () => st.putPrivateAsset("orgA", "uA", "orgA/creative/x/master.png", new Uint8Array(26 * 1024 * 1024), "draft"), StorageAuthError);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) { console.error("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL SHARED STORAGE CONTRACT TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
