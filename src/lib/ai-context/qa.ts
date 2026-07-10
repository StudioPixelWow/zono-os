// ============================================================================
// 🧪 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · offline QA (render).
// No DB/network. Run: npx tsx src/lib/ai-context/qa.ts
// ============================================================================
import { renderContextText, hasContextSignal, type AssembledContext } from "./render";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const ctx: AssembledContext = {
  entityType: "buyer", entityId: "B1",
  truthLine: "תקציב: 2500000",
  truthSensitivity: "confidential",
  memory: [
    { fact: "תקציב: 2500000", provenance: "explicit", sensitivity: "confidential", confidence: 90 },
    { fact: "אזור מועדף: חיפה", provenance: "explicit", sensitivity: "internal", confidence: 88 },
    { fact: "סיכון גבוה", provenance: "inferred", sensitivity: "restricted", confidence: 40 },
  ],
  orgPreferences: [{ fact: "כלל: אישור מנהל מעל מיליון", provenance: "explicit", sensitivity: "internal", confidence: 100 }],
  userPreferences: [],
  timeline: [{ title: "שיחה עם הקונה", occurredAt: "2026-07-10T09:00:00Z" }, { title: "נשלח נכס", occurredAt: "2026-07-09T09:00:00Z" }],
  relationships: [{ relationshipType: "interested_in", otherType: "property", otherId: "P1" }],
  recommendations: [{ title: "שלח נכס מתאים", why: "התאמה גבוהה" }],
};

const full = renderContextText(ctx, { forBroadPrompt: false });
check("full context includes confidential memory", full.includes("2500000"));
check("full context includes timeline", full.includes("שיחה עם הקונה"));
check("full context includes relationships", full.includes("interested_in"));
check("full context includes recommendations", full.includes("שלח נכס מתאים"));
check("provenance labelled (explicit)", full.includes("מפורש"));

// BROAD prompt drops confidential/restricted memory
const broad = renderContextText(ctx, { forBroadPrompt: true });
check("broad prompt DROPS confidential budget", !broad.includes("2500000"));
check("broad prompt DROPS restricted risk", !broad.includes("סיכון גבוה"));
check("broad prompt KEEPS internal area", broad.includes("חיפה"));
check("broad prompt keeps org rule (internal)", broad.includes("אישור מנהל"));

// empty context → empty string + no signal
const empty: AssembledContext = { entityType: "buyer", entityId: "B2", truthLine: null, memory: [], orgPreferences: [], userPreferences: [], timeline: [], relationships: [], recommendations: [] };
check("empty context → no signal", !hasContextSignal(empty));
check("empty context → empty text", renderContextText(empty) === "");
check("non-empty context → has signal", hasContextSignal(ctx));

// deterministic
check("render deterministic", renderContextText(ctx, { forBroadPrompt: true }) === renderContextText(ctx, { forBroadPrompt: true }));
// timeline cap respected
check("timeline capped", renderContextText({ ...ctx, timeline: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, occurredAt: "" })) }, { maxTimeline: 3 }).match(/• t\d/g)?.length === 3);

// ── Context modes: policy + sensitivity ceilings (PART 8) ────────────────────
import { modePolicy, sensitivityAllowed } from "./modes";

// public_site: strict — truth only, NO memory/graph/recs/docs/user-private
const pub = modePolicy("public_site");
check("public_site excludes memory", !pub.includeMemory);
check("public_site excludes graph", !pub.includeGraph);
check("public_site excludes recommendations", !pub.includeRecommendations);
check("public_site excludes documents", !pub.includeDocuments);
check("public_site excludes user-private", !pub.includeUserPrivate);
check("public_site ceiling = normal", pub.sensitivityCeiling === "normal");
check("public_site allows only normal sensitivity", sensitivityAllowed("public_site", "normal") && !sensitivityAllowed("public_site", "internal") && !sensitivityAllowed("public_site", "confidential"));

// executive: org memory yes, broker-PRIVATE never
const exec = modePolicy("executive");
check("executive includes memory", exec.includeMemory);
check("executive EXCLUDES user-private (broker memory)", !exec.includeUserPrivate);
check("executive ceiling = confidential (not restricted)", exec.sensitivityCeiling === "confidential" && !sensitivityAllowed("executive", "restricted"));

// internal_entity: full sensitivity + own private
const ent = modePolicy("internal_entity");
check("internal_entity full ceiling (restricted)", ent.sensitivityCeiling === "restricted" && sensitivityAllowed("internal_entity", "restricted"));
check("internal_entity includes user-private", ent.includeUserPrivate);

// document_scoped includes documents; recommendation_explanation caps small
check("document_scoped includes documents", modePolicy("document_scoped").includeDocuments);
check("recommendation_explanation excludes documents + preferences", !modePolicy("recommendation_explanation").includeDocuments && !modePolicy("recommendation_explanation").includePreferences);

// every mode defines hard caps (no unbounded layer)
for (const m of ["internal_entity", "internal_global", "executive", "broker_private", "public_site", "document_scoped", "recommendation_explanation"] as const) {
  const c = modePolicy(m).caps;
  check(`${m} has finite caps`, [c.timeline, c.graph, c.memory, c.recommendations, c.preferences].every((n) => Number.isFinite(n) && n >= 0));
}
check("mode policy deterministic", JSON.stringify(modePolicy("executive")) === JSON.stringify(modePolicy("executive")));

// ── Stale-conflict resolver (canonical truth wins) — Batch 4.5A ──────────────
import { detectStaleMemory } from "./stale";
import type { CtxMemory } from "./render";

const mem: CtxMemory[] = [
  { fact: "מחיר מבוקש: 2,000,000", provenance: "explicit", sensitivity: "internal", confidence: 80 },
  { fact: "אזור מועדף: חיפה", provenance: "explicit", sensitivity: "normal", confidence: 90 },
  { fact: "תקציב סביב 3.5 מיליון", provenance: "inferred", sensitivity: "internal", confidence: 40 },
];
const canon = [{ label: "מחיר", keywords: ["מחיר", "price"], value: "2,500,000" }];
const res = detectStaleMemory(canon, mem);
check("stale: contradicting price flagged stale", res.stale.some((s) => s.fact.includes("2,000,000")));
check("stale: matching-dimension non-conflict kept", res.fresh.some((f) => f.fact.includes("חיפה")));
check("stale: non-referencing memory kept fresh", res.fresh.some((f) => f.fact.includes("תקציב")));
check("stale: provenance preserved on stale item", res.stale[0]?.provenance === "explicit");
check("stale: empty canonical → all fresh", detectStaleMemory([], mem).fresh.length === 3 && detectStaleMemory([], mem).stale.length === 0);
// agreeing value is NOT stale
check("stale: agreeing price NOT flagged", detectStaleMemory([{ label: "מחיר", keywords: ["מחיר"], value: "2,000,000" }], mem).stale.length === 0);

// ── Canonical-fact extraction — Batch 4.5A ───────────────────────────────────
import { canonicalFactsFor } from "./canonical-facts";
check("canonical: property price extracted", canonicalFactsFor("property", { price: 2500000, status: "active" }).some((f) => f.label === "מחיר" && f.value === "2500000"));
check("canonical: zero/absent dropped", canonicalFactsFor("buyer", { budget: 0 }).length === 0);
check("canonical: unknown entity → empty", canonicalFactsFor("unknown", { x: 1 }).length === 0);

// ── Public-safe isolation (PART: public-safe validation) — Batch 4.5F ────────
// public_site must render NOTHING from memory/graph/recs even if items are present.
const leaky: AssembledContext = {
  entityType: "property", entityId: "P9", mode: "public_site",
  truthLine: "מחיר: 2,000,000", truthSensitivity: "normal",
  memory: [{ fact: "הערת סוכן פנימית", provenance: "explicit", sensitivity: "confidential", confidence: 90 }],
  orgPreferences: [{ fact: "כלל פנימי", provenance: "explicit", sensitivity: "internal", confidence: 80 }],
  userPreferences: [{ fact: "העדפת מתווך", provenance: "explicit", sensitivity: "restricted", confidence: 70 }],
  timeline: [{ title: "פעילות פנימית", occurredAt: "2026-07-10T09:00:00Z" }],
  relationships: [{ relationshipType: "owned_by", otherType: "seller", otherId: "S1" }],
  recommendations: [{ title: "פעולה פנימית", why: "סיבה" }],
};
const pubText = renderContextText(leaky, { forBroadPrompt: modePolicy("public_site").forBroadPrompt });
check("public-safe: internal memory never rendered", !pubText.includes("פנימית") || !pubText.includes("הערת"));
check("public-safe: confidential memory dropped", !pubText.includes("הערת סוכן פנימית"));
check("public-safe: restricted broker pref dropped", !pubText.includes("העדפת מתווך"));
check("public-safe: normal public truth allowed", pubText.includes("2,000,000"));

// ── Failure fallback + deterministic ordering — Batch 4.5F ────────────────────
import { detectStaleMemory as _dsm } from "./stale";
// A layer failing (empty) must never throw or fabricate — render still returns a string.
const partial: AssembledContext = { entityType: "buyer", entityId: "B9", truthLine: null, memory: [], orgPreferences: [], userPreferences: [], timeline: [{ title: "רק ציר זמן", occurredAt: "" }], relationships: [], recommendations: [] };
check("fallback: partial context still renders", typeof renderContextText(partial) === "string" && renderContextText(partial).includes("רק ציר זמן"));
check("fallback: stale resolver on empty memory safe", _dsm([{ label: "מחיר", keywords: ["מחיר"], value: "1" }], []).stale.length === 0);
check("deterministic: stale detection stable", JSON.stringify(_dsm([{ label: "מחיר", keywords: ["מחיר"], value: "5" }], mem)) === JSON.stringify(_dsm([{ label: "מחיר", keywords: ["מחיר"], value: "5" }], mem)));

// ── Deprecation registry — Batch 4.5F ────────────────────────────────────────
import { contextRegistryCounts, CONTEXT_DEPRECATION_REGISTRY } from "./deprecation-registry";
const rc = contextRegistryCounts();
check("registry: no active duplicate builder on a migrated surface", rc.activeDuplicateOnMigratedSurface === 0);
check("registry: all 5 required surfaces + Ask + public tracked", rc.onSharedAssembler + rc.enriched >= 7);
check("registry: separate-domain context honestly recorded", rc.separateDomain === 1);
check("registry: every record has a mode or explicit null", CONTEXT_DEPRECATION_REGISTRY.every((r) => r.mode !== undefined));

console.log(`\nShared AI Context (render + modes + stale + public-safe + fallback + registry) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
