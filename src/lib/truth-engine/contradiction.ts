// ============================================================================
// 🛡️ Truth Engine — Contradiction Engine (pure). 27.7. Part 4.
// Detects conflicting facts: different phones / office / address / owner /
// broker / valuation, outdated information, and conflicting sources. Only real
// disagreements in the provided values produce a contradiction — nothing is
// invented.
// ============================================================================
import type { Contradiction, ContradictionField, ContradictionSignals, Severity, FreshnessLevel } from "./types";

let _c = 0;
const cid = () => `contra-${++_c}`;
const norm = (v: string | null | undefined): string => (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
const distinct = (xs: (string | null | undefined)[]): string[] => [...new Set(xs.map(norm).filter(Boolean))];

const SEV: Record<ContradictionField, Severity> = {
  phone: "high", office: "high", address: "moderate", owner: "high",
  broker: "moderate", valuation: "high", outdated: "low", source: "moderate",
};

function fieldContradiction(field: ContradictionField, raw: (string | null | undefined)[]): Contradiction | null {
  const values = distinct(raw);
  if (values.length <= 1) return null;
  return {
    id: cid(), field, severity: SEV[field], values: values.slice(0, 6),
    note: `נמצאו ${values.length} ערכים שונים ל${labelOf(field)}`,
    evidence: values.slice(0, 4).map((v) => `${labelOf(field)}: ${v}`),
  };
}

function labelOf(field: ContradictionField): string {
  const HE: Record<ContradictionField, string> = {
    phone: "טלפון", office: "משרד", address: "כתובת", owner: "בעלים",
    broker: "מתווך", valuation: "הערכת שווי", outdated: "עדכניות", source: "מקור",
  };
  return HE[field];
}

/** Detect all contradictions from raw signals + freshness + conflicting sources. */
export function detectContradictions(
  signals: ContradictionSignals | undefined,
  opts: { freshnessLevel?: FreshnessLevel; contradictingSources?: number } = {},
): Contradiction[] {
  _c = 0;
  const out: Contradiction[] = [];
  if (signals) {
    const s = signals;
    const phone = fieldContradiction("phone", s.phones ?? []); if (phone) out.push(phone);
    const office = fieldContradiction("office", s.offices ?? []); if (office) out.push(office);
    const address = fieldContradiction("address", s.addresses ?? []); if (address) out.push(address);
    const owner = fieldContradiction("owner", s.owners ?? []); if (owner) out.push(owner);
    const broker = fieldContradiction("broker", s.brokers ?? []); if (broker) out.push(broker);

    // Valuation contradiction — a wide spread between numeric estimates.
    const vals = (s.valuations ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    if (vals.length >= 2) {
      const min = Math.min(...vals), max = Math.max(...vals);
      if (min > 0 && max / min >= 1.3) {
        out.push({
          id: cid(), field: "valuation", severity: max / min >= 1.6 ? "high" : "moderate",
          values: [`${Math.round(min).toLocaleString("he-IL")}`, `${Math.round(max).toLocaleString("he-IL")}`],
          note: `פער הערכות שווי ${Math.round((max / min - 1) * 100)}%`,
          evidence: vals.slice(0, 4).map((v) => `שווי: ${Math.round(v).toLocaleString("he-IL")}`),
        });
      }
    }
  }

  // Outdated information contradiction (freshness expired).
  if (opts.freshnessLevel === "expired") {
    out.push({ id: cid(), field: "outdated", severity: "low", values: ["expired"], note: "כל הראיות פגות תוקף", evidence: ["אין ראיה עדכנית ב-90 יום האחרונים"] });
  }
  // Conflicting sources (evidence graph reported contradicting sources).
  if ((opts.contradictingSources ?? 0) > 0) {
    out.push({ id: cid(), field: "source", severity: (opts.contradictingSources ?? 0) >= 2 ? "high" : "moderate", values: [`${opts.contradictingSources}`], note: `${opts.contradictingSources} מקורות סותרים`, evidence: [`${opts.contradictingSources} ראיות מסמנות סתירה`] });
  }

  return out;
}

export function contradictionPenalty(contradictions: Contradiction[]): number {
  const w: Record<Severity, number> = { high: 25, moderate: 12, low: 5 };
  return Math.min(60, contradictions.reduce((s, c) => s + w[c.severity], 0));
}
