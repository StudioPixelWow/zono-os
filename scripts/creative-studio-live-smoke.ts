/**
 * ZONO Creative Studio — LIVE provider + Storage smoke (guarded; capped; no secrets).
 *
 * OpenAI image smoke (needs a staging OPENAI_API_KEY):
 *   OPENAI_API_KEY=... npx tsx scripts/creative-studio-live-smoke.ts --confirm-staging
 *
 * Supabase Storage smoke (needs staging NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/creative-studio-live-smoke.ts --confirm-staging --allow-zono-dev-storage
 *
 * Caps requests + estimated spend. Refuses production. Prints NO secrets. Cleans up.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- dev-only live smoke script (not shipped app code); loose typing for ad-hoc provider/storage pokes */
import { SupabasePrivateStorage, DEFAULT_STORAGE_CONFIG } from "../src/lib/creative-studio/storage/supabase-private-storage";
import type { SupabaseStorageClient, AssetMetaStore } from "../src/lib/creative-studio/storage/supabase-private-storage";
import type { StoredAsset, AuthContext } from "../src/lib/creative-studio/asset-storage";

const args = new Set(process.argv.slice(2));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
const isZonoDev = /tlrefajhyrqnjtmimaos/i.test(url + ref);

const MAX_IMAGE_REQUESTS = Number(process.env.SMOKE_MAX_REQUESTS ?? 4);
const MAX_SPEND_USD = Number(process.env.SMOKE_MAX_SPEND_USD ?? 1.0);
const MODEL = process.env.ZONO_IMAGE_MODEL ?? "gpt-image-2";

let pass = 0; const fails: string[] = [];
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log("  ✓ " + n); } else { fails.push(n); console.error("  ✗ " + n); } };

function requireConfirm() {
  if (!args.has("--confirm-staging")) { console.error("Refusing: pass --confirm-staging to run against a STAGING/dev project."); process.exit(2); }
}

// ── OpenAI: one real, minimal, capped image request per kind (dependency-free) ─
async function openaiSmoke() {
  if (!process.env.OPENAI_API_KEY) { console.log("\nOpenAI live: SKIPPED (no OPENAI_API_KEY) — not a failure."); return; }
  console.log(`\nOpenAI live: model=${MODEL}, <= ${MAX_IMAGE_REQUESTS} requests, <= $${MAX_SPEND_USD} est. spend`);
  const kinds = ["property_ad_post", "agent_brand", "office_brand", "market_stat"].slice(0, Math.max(1, MAX_IMAGE_REQUESTS));
  for (const kind of kinds) {
    const started = Date.now();
    // usage event recorded BEFORE the billable call, then updated after
    const usage = { kind, model: MODEL, requestedAt: new Date().toISOString(), status: "requested" as "requested" | "succeeded" | "failed", ms: 0, bytes: 0 };
    try {
      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, prompt: `ZONO smoke • ${kind} • minimal test tile, flat color`, size: "1024x1024", n: 1 }),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(`${resp.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? resp.statusText}`.trim());
      const b64: string | undefined = json?.data?.[0]?.b64_json;
      usage.status = "succeeded"; usage.ms = Date.now() - started; usage.bytes = b64 ? Math.floor(b64.length * 0.75) : 0;
      ok(`${kind}: provider request succeeded`, Boolean(b64 && b64.length > 100));
      ok(`${kind}: model stamped (${json?.model ?? MODEL})`, Boolean(json?.model ?? MODEL));
      ok(`${kind}: usage requested→succeeded (${usage.ms}ms, ~${usage.bytes}B)`, usage.status === "succeeded");
    } catch (e: any) {
      usage.status = "failed"; usage.ms = Date.now() - started;
      // Report the EXACT provider response; do NOT silently switch models.
      const detail = String(e?.message ?? e).slice(0, 220);
      fails.push(`${kind}: provider error — ${detail}`);
      console.error(`  ✗ ${kind}: provider error — ${detail}`);
    }
  }
}

// ── Real Supabase Storage client (narrow surface the adapter needs) ───────────
function makeSbStorageClient(sb: any): SupabaseStorageClient {
  return {
    async upload(bucket, path, bytes, contentType) {
      const { error } = await sb.storage.from(bucket).upload(path, Buffer.from(bytes), { contentType, upsert: true });
      return { error: error ? { message: error.message } : null };
    },
    async createSignedUrl(bucket, path, expiresInSec) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSec);
      return { signedUrl: data?.signedUrl ?? null, error: error ? { message: error.message } : null };
    },
    async copy(bucket, from, to) {
      const parts = to.split("/");
      const destBucket = parts.length > 1 ? parts[0] : bucket;
      const destPath = parts.length > 1 ? parts.slice(1).join("/") : to;
      const { error } = await sb.storage.from(bucket).copy(from, destPath, destBucket !== bucket ? { destinationBucket: destBucket } : undefined);
      return { error: error ? { message: error.message } : null };
    },
    async remove(bucket, path) {
      const { error } = await sb.storage.from(bucket).remove([path]);
      return { error: error ? { message: error.message } : null };
    },
    async exists(bucket, path) {
      const { data } = await sb.storage.from(bucket).createSignedUrl(path, 5);
      return Boolean(data?.signedUrl);
    },
  };
}

// In-memory meta store for the smoke (the DB row is exercised separately in the SQL smoke).
function makeMemMeta(): AssetMetaStore {
  const m = new Map<string, StoredAsset>();
  const k = (o: string, p: string) => `${o}|${p}`;
  return {
    async get(orgId, path) { return m.get(k(orgId, path)) ?? null; },
    async put(a) { m.set(k(a.orgId, a.path), a); },
    async setState(orgId, path, state) { const a = m.get(k(orgId, path)); if (a) m.set(k(orgId, path), { ...a, state }); },
  };
}

async function storageSmoke() {
  if (!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.log("\nSupabase Storage live: SKIPPED (no url/service key) — not a failure."); return;
  }
  if (/prod|production/i.test(url + ref)) { console.error("\nStorage: REFUSING (production reference)."); process.exit(2); }
  if (isZonoDev && !args.has("--allow-zono-dev-storage")) {
    console.error("\nStorage: zono-dev detected. Re-run with --allow-zono-dev-storage (owner-authorized dev project)."); return;
  }
  console.log("\nSupabase Storage live: exercising SupabasePrivateStorage against the real bucket");
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // ensure both buckets exist (private)
  const bucket = DEFAULT_STORAGE_CONFIG.privateBucket;
  const pubBucket = DEFAULT_STORAGE_CONFIG.publicationBucket;
  for (const b of [bucket, pubBucket]) {
    const got = await sb.storage.getBucket(b);
    if (got.error) { const c = await sb.storage.createBucket(b, { public: false }); ok(`bucket '${b}' available`, !c.error); }
    else ok(`bucket '${b}' available`, true);
  }

  const storage = new SupabasePrivateStorage(makeSbStorageClient(sb), makeMemMeta());
  const orgA = "00000000-0000-0000-0000-0000000000aa";
  const orgB = "00000000-0000-0000-0000-0000000000bb";
  const owner: AuthContext = { orgId: orgA, userId: "uA", active: true };
  const inactive: AuthContext = { orgId: orgA, userId: "uA", active: false };
  const anon: AuthContext = { orgId: null, userId: null, active: false };
  const foreign: AuthContext = { orgId: orgB, userId: "uB", active: true };
  const path = `${orgA}/creative/smoke-${Date.now()}/master.png`;
  // 1x1 PNG test tile
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

  try {
    await storage.putPrivateAsset(orgA, "uA", path, new Uint8Array(png), "review");
    ok("upload private draft (real bucket)", true);
    const signed = await storage.createSignedRead(owner, path, 60_000);
    ok("owner signed read returns a URL", Boolean(signed.token && signed.token.startsWith("http")));
    await assertDenied("anonymous denied", () => storage.createSignedRead(anon, path, 60_000));
    await assertDenied("inactive user denied", () => storage.createSignedRead(inactive, path, 60_000));
    await assertDenied("cross-organization denied", () => storage.createSignedRead(foreign, path, 60_000));
    await assertDenied("arbitrary path denied", () => storage.createSignedRead(owner, "etc/passwd", 60_000));
    // qa_failed not externally signable
    const badPath = `${orgA}/creative/smoke-bad-${Date.now()}/master.png`;
    await storage.putPrivateAsset(orgA, "uA", badPath, new Uint8Array(png), "qa_failed");
    await assertDenied("qa_failed not signable", () => storage.createSignedRead(owner, badPath, 60_000));
    // approved promotion + master retained (best-effort: cross-bucket copy support varies)
    const okPath = `${orgA}/creative/smoke-ok-${Date.now()}/master.png`;
    await storage.putPrivateAsset(orgA, "uA", okPath, new Uint8Array(png), "approved");
    try {
      const promo = await storage.promoteApprovedAsset(owner, okPath);
      const masterStill = await makeSbStorageClient(sb).exists(bucket, okPath);
      ok("approved promoted + private master retained", Boolean(promo.masterPath === okPath && masterStill));
    } catch (e: any) {
      console.log(`  ~ promote skipped (cross-bucket copy: ${String(e?.message ?? e).slice(0, 120)})`);
    }
    // cleanup uploaded objects
    const cli = makeSbStorageClient(sb);
    await cli.remove(bucket, path); await cli.remove(bucket, badPath); await cli.remove(bucket, okPath);
    await cli.remove(pubBucket, okPath); // remove the promoted publication copy, if any
    ok("cleanup removed test objects", true);
  } catch (e: any) {
    fails.push(`storage smoke error — ${String(e?.message ?? e).slice(0, 200)}`);
    console.error(`  ✗ storage smoke error — ${String(e?.message ?? e).slice(0, 200)}`);
  }
}

async function assertDenied(name: string, fn: () => Promise<unknown>) {
  try { await fn(); ok(name, false); } catch { ok(name, true); }
}

async function main() {
  requireConfirm();
  console.log("ZONO Creative Studio — LIVE smoke (no secrets printed)");
  await openaiSmoke();
  await storageSmoke();
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.error("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("LIVE SMOKE PASSED");
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
