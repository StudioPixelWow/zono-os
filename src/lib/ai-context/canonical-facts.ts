// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5A · Canonical-fact extraction (PURE).
// Turns a loaded entity record into the CanonicalFact[] the stale resolver uses
// so current truth (live price/budget/status) always wins over stale memory. Pure
// + defensive (loose record) — the cockpit already loaded the record, so this
// never adds a DB read. Only emits a fact when the field is present + non-zero.
// ============================================================================
import type { CanonicalFact } from "./stale";

type Rec = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

export function canonicalFactsFor(entityType: string, r: Rec | null | undefined): CanonicalFact[] {
  if (!r) return [];
  const out: CanonicalFact[] = [];
  const push = (label: string, keywords: string[], value: unknown) => {
    const v = str(value);
    if (v && v !== "0") out.push({ label, keywords, value: v });
  };

  switch (entityType) {
    case "property":
    case "listing":
      push("מחיר", ["מחיר", "price", "asking"], r.price ?? r.asking_price ?? r.list_price);
      push("סטטוס", ["סטטוס", "status"], r.status);
      break;
    case "buyer":
      push("תקציב", ["תקציב", "budget", "מחיר"], r.budget_max ?? r.max_budget ?? r.budget);
      push("סטטוס", ["סטטוס", "status"], r.status);
      break;
    case "seller":
      push("מחיר מבוקש", ["מחיר", "asking", "price"], r.asking_price ?? r.price);
      push("סטטוס", ["סטטוס", "status"], r.status);
      break;
    case "lead":
      push("שלב", ["שלב", "stage", "status"], r.stage ?? r.status);
      break;
    case "deal":
      push("סכום", ["סכום", "amount", "price", "מחיר"], r.amount ?? r.deal_amount ?? r.price);
      push("שלב", ["שלב", "stage", "status"], r.stage ?? r.status);
      break;
  }
  return out;
}
