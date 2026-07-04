// ============================================================================
// ✅ Property Marketing Action Center — self-tests (pure, offline). 33.3.
// due-now / failed attention / pending leads / recommendations / prioritization /
// empty / approval-gating / no-campaign / not-connected / perf.
// ============================================================================
import { buildActionCenter, type ActionCenterInput } from "./actions";

export interface ACCheck { name: string; pass: boolean; detail: string }
export interface ACSelfCheck { ok: boolean; total: number; passed: number; checks: ACCheck[] }

const input = (o: Partial<ActionCenterInput> = {}): ActionCenterInput => ({
  campaigns: 1, scheduled: 4, dueNow: 0, published: 2, failed: 0, comments: 5, leads: 1, pendingLeads: 0, creatives: 2, connected: true, ...o,
});

export function runSelfCheck(): ACSelfCheck {
  const checks: ACCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const due = buildActionCenter(input({ dueNow: 3 }));
  add("due-now assisted publish surfaces", due.dueNow.some((i) => i.kind === "assisted_publish" && i.count === 3));
  add("due-now headline", due.headline.includes("עכשיו"));

  const failed = buildActionCenter(input({ failed: 2 }));
  add("failed posts → attention", failed.dueNow.some((i) => i.kind === "review_failed" && i.count === 2));

  const pend = buildActionCenter(input({ pendingLeads: 4 }));
  add("pending leads → approval item", pend.pending.some((i) => i.kind === "review_leads" && i.status === "pending_approval" && i.count === 4));
  add("lead approval is approval-gated", pend.pending.every((i) => i.requiresApproval));

  const noCampaign = buildActionCenter(input({ campaigns: 0 }));
  add("no campaign → recommend launch", noCampaign.recommended.some((i) => i.kind === "launch_campaign" && i.cta.href === "/distribution/campaign-wizard"));

  const notConn = buildActionCenter(input({ connected: false }));
  add("not connected → recommend connect facebook", notConn.recommended.some((i) => i.kind === "connect_facebook" && i.cta.href === "/settings/distribution-connections"));

  const noCreative = buildActionCenter(input({ creatives: 0 }));
  add("no creatives → recommend generate", noCreative.recommended.some((i) => i.kind === "generate_creative"));

  const published = buildActionCenter(input({ published: 5, pendingLeads: 0 }));
  add("published + no pending → monitor comments", published.recommended.some((i) => i.kind === "monitor_comments"));

  // Prioritization: due-now outranks pending outranks recommended.
  const mixed = buildActionCenter(input({ dueNow: 1, pendingLeads: 1, campaigns: 0 }));
  add("prioritized due>pending>recommended", mixed.dueNow[0].priority > mixed.pending[0].priority && mixed.pending[0].priority > mixed.recommended[0].priority);

  // Empty state (all done, connected, has campaign/creatives, nothing due/pending).
  const empty = buildActionCenter({ campaigns: 1, scheduled: 0, dueNow: 0, published: 0, failed: 0, comments: 0, leads: 0, pendingLeads: 0, creatives: 1, connected: true });
  add("empty when nothing actionable", empty.isEmpty && empty.headline.includes("אין"));

  add("every actionable/pending item routes to an existing flow", [...due.dueNow, ...pend.pending].every((i) => i.cta.href.startsWith("/")));

  const t0 = Date.now();
  for (let k = 0; k < 5000; k++) buildActionCenter(input({ dueNow: k % 5, pendingLeads: k % 3, campaigns: k % 2, connected: !!(k % 2) }));
  add("5000 builds < 150ms", Date.now() - t0 < 150, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
