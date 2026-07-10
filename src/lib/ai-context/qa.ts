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

console.log(`\nShared AI Context (render) QA — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
