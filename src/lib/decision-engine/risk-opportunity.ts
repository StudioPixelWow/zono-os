// ============================================================================
// ⚠️ Risk Engine + 🎯 Opportunity Engine (pure). 27.4 · Part 7/8.
// Detect risks (inactivity / decline / stagnation / competitive threat / churn)
// and opportunities (inventory / broker / territory / competitive) from real
// signals. Evidence-only, deterministic.
// ============================================================================
import type { OfficeDecisionSignals, Risk, Opportunity } from "./types";

let _r = 0, _o = 0;

export function buildRisks(sig: OfficeDecisionSignals): Risk[] {
  _r = 0;
  const out: Risk[] = [];
  const add = (type: string, severity: Risk["severity"], title: string, evidence: string) => out.push({ id: `risk-${++_r}`, type, severity, title, evidence });
  if (!sig.hasData) return out;

  if (sig.momentum === "declining" || sig.growthPct < 0) add("office_decline", sig.growthPct <= -20 ? "high" : "moderate", "ירידה בפעילות המשרד", `ירידה של ${Math.abs(sig.growthPct)}% במודעות ב-60 יום`);
  if (sig.activeListings > 0 && sig.brokers <= 1) add("broker_inactivity", "moderate", "מעט מתווכים פעילים", `${sig.brokers} מתווכים מול ${sig.activeListings} מודעות פעילות`);
  if (sig.stagnantListings >= 3) add("listing_stagnation", sig.stagnantListings >= 10 ? "high" : "moderate", "מודעות תקועות", `${sig.stagnantListings} מודעות לא פעילות/מיושנות`);
  if (sig.fastestGrowingCompetitor && sig.fastestGrowingCompetitor.growthPct >= 30) add("competitive_threat", "high", "איום תחרותי", `${sig.fastestGrowingCompetitor.name} צמח ${sig.fastestGrowingCompetitor.growthPct}%`);
  else if (sig.threatLevel === "moderate") add("competitive_threat", "moderate", "לחץ תחרותי", `רמת איום ${sig.threatLevel}`);
  for (const t of sig.swotThreats.slice(0, 2)) add("swot_threat", "moderate", t.text, t.evidence);
  return out.sort((a, b) => sev(b.severity) - sev(a.severity)).slice(0, 8);
}
const sev = (s: Risk["severity"]) => (s === "high" ? 3 : s === "moderate" ? 2 : 1);

export function buildOpportunities(sig: OfficeDecisionSignals): Opportunity[] {
  _o = 0;
  const out: Opportunity[] = [];
  const add = (type: string, title: string, evidence: string, area: string | null) => out.push({ id: `opp-${++_o}`, type, title, evidence, area });
  if (!sig.hasData) return out;

  for (const e of sig.expansionOpportunities.slice(0, 4)) add("territory", `התרחבות ל${e.name}`, e.reason, e.name);
  if (sig.brokers <= 3 && sig.brokerSharePct < 20) add("broker", "גיוס מתווכים", `נתח מתווכים ${sig.brokerSharePct}% · ${sig.brokers} מתווכים`, null);
  for (const o of sig.swotOpportunities.slice(0, 3)) add("competitive", o.text, o.evidence, null);
  for (const w of sig.weakAreas.slice(0, 2)) add("inventory", `הגדל מלאי ב${w.name}`, `נתח נוכחי ${w.sharePct}%`, w.name);
  return out.slice(0, 8);
}
