// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 5.9 · EXECUTIVE MEMORY QA (offline).
// Run: npx tsx src/lib/executive-memory/qa.ts
// ============================================================================
import { readFileSync } from "node:fs";
import type { ExecutiveDecision } from "@/lib/executive-decision/types";
import { diffSnapshots, entriesEqual, toMemoryEntries, toTimeline } from "./engine";
import type { MemorySnapshot } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);

const dec = (o: Partial<ExecutiveDecision> = {}): ExecutiveDecision => ({
  id: "decision:queue:seller:S1:retention", category: "Pipeline", priority: 1, upstreamPriority: 90,
  headline: "מוכר בסיכון נטישה: נועם", summary: "בהתבסס על תור המודיעין הקנוני: סיכון נטישה גבוה.",
  whyNow: "בהתבסס על ההמלצה הקנונית — דחיפות critical.", recommendedAction: "צור קשר יזום היום",
  expectedImpact: "מניעת אובדן הבלעדיות",
  evidence: [
    { label: "מוכר בסיכון", source: "broker-intelligence queue", recommendationId: "seller:S1:retention" },
    { label: "סיכון נטישה 72", source: "CRM", recommendationId: "seller:S1:retention" },
  ],
  affectedEntities: [{ entityType: "seller", entityId: "S1", title: "נועם", href: "/sellers/S1" }],
  confidence: 74, links: ["/sellers/S1"], ...o,
});
const snap = (id: string, at: string, decisions: ExecutiveDecision[], noAction = false): MemorySnapshot =>
  ({ id, orgScoped: true, audience: "manager", takenAt: at, entries: toMemoryEntries(decisions), noActionRequired: noAction });

const D1 = dec();
const D2 = dec({ id: "decision:queue:journey:J2:stall", category: "Journey", priority: 2, upstreamPriority: 83, headline: "מסע תקוע: דירה", recommendedAction: "פתח את כרטיס הנכס", confidence: 75, evidence: [{ label: "40 ימים ללא מעבר מאומת", source: "journeys", recommendationId: "journey:J2:stall" }] });
const D3 = dec({ id: "decision:queue:deal:D1:close", category: "Pipeline", priority: 3, upstreamPriority: 70, headline: "עסקה בשלה לסגירה", recommendedAction: "קבע חתימה", confidence: 80, evidence: [{ label: "כל התנאים הושלמו", source: "deals", recommendationId: "deal:D1:close" }] });

const OLD = snap("snap-old", "2026-07-10T08:00:00Z", [D1, D2]);

S("1. Snapshot integrity — pure selection, canonical identities, no recomputation");
{
  const entries = toMemoryEntries([D1, D2, D3]);
  check("1.1 entries preserve decision id / priority / confidence / action verbatim",
    entries.length === 3 && entries.every((e) => {
      const d = [D1, D2, D3].find((x) => x.id === e.decisionId)!;
      return e.priority === d.priority && e.upstreamPriority === d.upstreamPriority
        && e.confidence === d.confidence && e.recommendedAction === d.recommendedAction && e.category === d.category;
    }));
  check("1.2 evidence ids reference CANONICAL identities (recommendationId), deduplicated + sorted",
    JSON.stringify(entries.find((e) => e.decisionId === D1.id)!.evidenceIds) === JSON.stringify(["seller:S1:retention"]));
  check("1.3 entries are stably ordered by decision id", JSON.stringify(entries.map((e) => e.decisionId)) === JSON.stringify([...entries.map((e) => e.decisionId)].sort()));
  check("1.4 entriesEqual is order-insensitive and content-exact",
    entriesEqual(toMemoryEntries([D2, D1]), toMemoryEntries([D1, D2])) && !entriesEqual(toMemoryEntries([D1]), toMemoryEntries([D2])));
  // Postgres jsonb rewrites object key order on round-trip (length-then-alpha).
  // Dedup must be KEY-ORDER INSENSITIVE or every unchanged visit would write a
  // duplicate snapshot (live bug found in 5.9 verification — locked here).
  const roundTripped = toMemoryEntries([D1, D2]).map((e) => {
    const reordered: Record<string, unknown> = {};
    for (const k of Object.keys(e).sort((a, b) => a.length - b.length || (a < b ? -1 : 1))) reordered[k] = (e as unknown as Record<string, unknown>)[k];
    return JSON.parse(JSON.stringify(reordered));
  });
  check("1.5 entriesEqual survives a jsonb key-order round-trip (append-only dedup works against stored rows)",
    entriesEqual(roundTripped, toMemoryEntries([D1, D2]))
    && !entriesEqual(roundTripped, toMemoryEntries([D1, dec({ ...D2, priority: 3 })])));
}

S("2. Change detection — all seven kinds, nothing else");
{
  const NEW = snap("snap-new", "2026-07-11T08:00:00Z", [
    D1,                                                                      // unchanged
    dec({ ...D2, priority: 1, upstreamPriority: 95 }),                       // priority changed
    D3,                                                                      // new decision
  ]);
  const r = diffSnapshots(OLD, NEW);
  check("2.1 NEW decision detected with the mandated language", r.newDecisions.length === 1 && r.newDecisions[0].detail.startsWith("נוספה החלטה"));
  check("2.2 PRIORITY change detected with old→new values", r.priorityChanges.length === 1 && r.priorityChanges[0].from === "2/83" && r.priorityChanges[0].to === "1/95" && r.priorityChanges[0].detail.includes("עדיפות השתנתה"));
  check("2.3 unchanged decision produces NO change entries", [r.confidenceChanges, r.evidenceChanges, r.categoryChanges, r.actionChanges, r.resolvedDecisions].every((a) => a.length === 0));
  const GONE = snap("snap-gone", "2026-07-12T08:00:00Z", [D1]);
  const r2 = diffSnapshots(NEW, GONE);
  check("2.4 REMOVED decision detected ('הוסרה החלטה')", r2.resolvedDecisions.length === 2 && r2.resolvedDecisions.every((c) => c.detail.startsWith("הוסרה החלטה")));
  const r3 = diffSnapshots(OLD, snap("s", "2026-07-13T08:00:00Z", [dec({ confidence: 60 }), D2]));
  check("2.5 CONFIDENCE change detected with values", r3.confidenceChanges.length === 1 && r3.confidenceChanges[0].from === "74" && r3.confidenceChanges[0].to === "60");
  const r4 = diffSnapshots(OLD, snap("s", "2026-07-13T08:00:00Z", [dec({ evidence: [{ label: "אחר", source: "CRM" }] }), D2]));
  check("2.6 EVIDENCE change detected ('הראיות השתנו') with preserved refs", r4.evidenceChanges.length === 1 && r4.evidenceChanges[0].detail.includes("הראיות השתנו") && r4.evidenceChanges[0].from === "seller:S1:retention");
  const r5 = diffSnapshots(OLD, snap("s", "2026-07-13T08:00:00Z", [dec({ category: "Opportunities" }), D2]));
  check("2.7 CATEGORY change detected", r5.categoryChanges.length === 1 && r5.categoryChanges[0].from === "Pipeline" && r5.categoryChanges[0].to === "Opportunities");
  const r6 = diffSnapshots(OLD, snap("s", "2026-07-13T08:00:00Z", [dec({ recommendedAction: "פעולה אחרת" }), D2]));
  check("2.8 ACTION change detected with old/new verbatim", r6.actionChanges.length === 1 && r6.actionChanges[0].from === "צור קשר יזום היום" && r6.actionChanges[0].to === "פעולה אחרת");
}

S("3. No interpretation, mandated language only");
{
  const NEW = snap("snap-new", "2026-07-11T08:00:00Z", [D1, D3]);
  const r = diffSnapshots(OLD, NEW);
  const all = JSON.stringify(r);
  check("3.1 summary uses 'מאז הביקור האחרון'", r.summary.includes("מאז הביקור האחרון"));
  check("3.2 no speculation / opinion language anywhere",
    [/המערכת חושבת/, /כנראה/, /נראה ש/, /probably/i, /I think/i].every((p) => !p.test(all)));
  check("3.3 no success/failure judgment or inferred cause",
    !/הצלחה|כישלון|בגלל ש|כתוצאה מ/.test(all));
  check("3.4 every change references old+new snapshot and decision id",
    [...r.newDecisions, ...r.resolvedDecisions].every((c) => c.newSnapshotId === "snap-new" && c.oldSnapshotId === "snap-old" && !!c.decisionId));
  const first = diffSnapshots(null, NEW);
  check("3.5 first review is honest — no fabricated 'changes'",
    first.firstReview && first.newDecisions.length === 0 && first.summary.includes("הראשון"));
  const same = diffSnapshots(OLD, { ...OLD });
  check("3.6 identical snapshots ⇒ explicit 'אין שינוי', zero items",
    same.summary.includes("אין שינוי") && [same.newDecisions, same.resolvedDecisions, same.priorityChanges].every((a) => a.length === 0));
}

S("4. Determinism and stable ordering");
{
  const NEW = snap("snap-new", "2026-07-11T08:00:00Z", [D3, D1]);
  const a = diffSnapshots(OLD, NEW);
  const b = diffSnapshots(OLD, snap("snap-new", "2026-07-11T08:00:00Z", [D1, D3]));
  check("4.1 diff is input-order independent (byte-identical)", JSON.stringify(a) === JSON.stringify(b));
  const t = toTimeline([OLD, snap("s2", "2026-07-12T08:00:00Z", [D1]), snap("s3", "2026-07-11T09:00:00Z", [D1])]);
  check("4.2 timeline is newest-first and stable", t[0].snapshotId === "s2" && t[1].snapshotId === "s3" && t[2].snapshotId === "snap-old");
  check("4.3 timeline items carry sorted decision ids + noAction flag", t.every((x) => JSON.stringify(x.decisionIds) === JSON.stringify([...x.decisionIds].sort())));
}

S("5. Runtime boundary — read-only, no recompute, org/audience isolation");
{
  const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const eng = strip(readFileSync("src/lib/executive-memory/engine.ts", "utf8"));
  const svc = strip(readFileSync("src/lib/executive-memory/service.ts", "utf8"));
  const sto = strip(readFileSync("src/lib/executive-memory/storage.ts", "utf8"));
  check("5.1 engine is pure — no I/O, no Date.now, no randomization",
    !eng.includes("createClient") && !eng.includes("Math.random") && !eng.includes("Date.now"));
  check("5.2 no reprioritization / no recommendation creation — Memory never rescores",
    // fields may be SELECTED verbatim (e.g. `confidence: d.confidence`) but no
    // arithmetic on priority/confidence and no invented actions may exist.
    !eng.match(/priority\s*[+\-*/]/) && !eng.match(/confidence\s*[+\-*/]/)
    && eng.includes("confidence: d.confidence") && eng.includes("priority: d.priority")
    && !svc.includes("suggestedAction"));
  check("5.3 storage is append-only (insert + select; no update/delete/upsert)",
    sto.includes(".insert(") && !sto.includes(".update(") && !sto.includes(".delete(") && !sto.includes(".upsert("));
  check("5.4 no forbidden inputs (journey tables, legacy scores, timestamps-as-reasoning)",
    [eng, svc, sto].every((s) => !/from\("journeys"\)|journey_events|stage_entered_at|velocity_state|health_score|conversion_score|journey_predictions|journey-intelligence/.test(s)));
  check("5.5 service consumes the FROZEN decision engine read-only",
    svc.includes("getExecutiveDecisions") && !svc.includes("buildExecutiveDecisions"));
  check("5.6 storage is RLS org-scoped via the session client (no service-role, no raw SQL)",
    !sto.includes("createServiceRoleClient") && !sto.includes(".rpc(\"execute") && sto.includes("createClient"));
  const mig = readFileSync("supabase/migrations/20260928120000_executive_memory_snapshots.sql", "utf8");
  check("5.7 migration: RLS enabled, org + manager-audience policies, NO update/delete policies (immutable)",
    mig.includes("enable row level security") && mig.includes("current_org_id()") && mig.includes("has_min_role('manager')")
    && !mig.includes("for update") && !mig.includes("for delete"));
  check("5.8 retention is a read window (default 90) — configurable, never destructive",
    sto.includes("DEFAULT_RETENTION_DAYS") && strip(readFileSync("src/lib/executive-memory/types.ts", "utf8")).includes("DEFAULT_RETENTION_DAYS = 90"));
  const az = strip(readFileSync("src/lib/ask-zono/service.ts", "utf8"));
  check("5.9 Copilot consumes Executive Memory (additive engine, no duplicate diffing)",
    az.includes("getExecutiveMemory(") && !az.includes("diffSnapshots"));
}

console.log(`\nExecutive Memory (5.9) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
