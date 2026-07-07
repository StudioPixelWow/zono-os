// ============================================================================
// 📱 ZONO — Mobile OS — offline self-check (pure). PHASE 57.0.
// Spec QA: offline read (cache policy present), offline write queue, sync
// recovery, push mock, camera/voice/GPS handoffs, no duplicate storage.
// ============================================================================
import { enqueue, flushPlan, markSyncing, markDone, markFailed, pendingItems, prune, stuckItems, stats } from "./queue";
import { buildManifest, buildRouteUrl, pushMock, CAPABILITIES, MOBILE_VIEWPORT } from "./pwa";
import { MAX_ATTEMPTS, type QueuedAction } from "./types";

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Enqueue an APPROVED action.
  let q: QueuedAction[] = [];
  const e1 = enqueue(q, { idempotencyKey: "visit:1", kind: "mark_visit_done", label: "סיום ביקור", approved: true });
  q = e1.queue;
  add("enqueue approved action", e1.added && q.length === 1);

  // 2. Reject an UNAPPROVED action (safety).
  const e2 = enqueue(q, { idempotencyKey: "post:1", kind: "publish", label: "פרסום", approved: false });
  add("reject unapproved action", !e2.added && e2.queue.length === 1);

  // 3. No duplicate storage — same idempotencyKey not queued twice.
  const e3 = enqueue(q, { idempotencyKey: "visit:1", kind: "mark_visit_done", label: "שוב", approved: true });
  add("no duplicate: same key not re-queued", !e3.added && e3.queue.length === 1);

  // 4. Offline → flush plan holds (empty). Online → returns pending.
  add("offline read/write: flush holds while offline", flushPlan(q, false).length === 0);
  add("online: flush returns pending", flushPlan(q, true).length === 1);

  // 5. Successful sync marks done + prune clears it.
  const target = q[0].id;
  q = markSyncing(q, target);
  add("sync: attempts incremented", q[0].attempts === 1 && q[0].status === "syncing");
  q = markDone(q, target);
  add("sync: marked done", q[0].status === "done" && flushPlan(q, true).length === 0);
  add("prune: done items removed", prune(q).length === 0);

  // 6. Sync recovery — a failing item retries up to MAX_ATTEMPTS then is stuck.
  let q2: QueuedAction[] = enqueue([], { idempotencyKey: "sr:1", kind: "x", label: "x", approved: true }).queue;
  const id2 = q2[0].id;
  for (let i = 0; i < MAX_ATTEMPTS; i++) { q2 = markSyncing(q2, id2); q2 = markFailed(q2, id2, "net"); }
  add("sync recovery: retried until cap", q2[0].attempts === MAX_ATTEMPTS);
  add("sync recovery: no longer pending after cap", pendingItems(q2).length === 0 && stuckItems(q2).length === 1);

  // 7. Stats reflect the queue.
  const st = stats(q2);
  add("stats: failed counted", st.failed === 1 && st.total === 1);

  // 8. PWA manifest installability fields present.
  const m = buildManifest();
  add("manifest: standalone + start_url + rtl + icons", m.display === "standalone" && m.start_url === "/today" && m.dir === "rtl" && m.icons.length >= 2);
  add("viewport: mobile viewport defined", MOBILE_VIEWPORT.width === "device-width");

  // 9. GPS route handoff builds a maps deep link.
  const url = buildRouteUrl([{ address: "רחוב הרצל 1, תל אביב" }, { lat: 32.08, lng: 34.78 }]);
  add("gps: route deep link built", !!url && url.includes("google.com/maps/dir") && url.includes("destination="));
  add("gps: empty stops → null", buildRouteUrl([]) === null);
  add("gps: waze provider", (buildRouteUrl([{ address: "יעד" }], "waze") ?? "").includes("waze.com/ul"));

  // 10. Push mock is safe (never subscribed without keys).
  const p = pushMock({});
  add("push mock: supported but not subscribed", p.supported && p.subscribed === false && p.endpointMock === "mock://push/not-configured");

  // 11. Capabilities each declare a reuse target (no rebuild).
  add("capabilities: all reuse existing flows", CAPABILITIES.length >= 6 && CAPABILITIES.every((c) => !!c.reuse));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
