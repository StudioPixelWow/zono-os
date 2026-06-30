// ============================================================================
// 🔎 Safe broker search-query generation (Phase 26.13b, PART 3). Pure.
// Generates the queries a real web-search provider WOULD run. Stored in the
// dossier for transparency. No network here.
// ============================================================================

/** Build safe, deterministic search queries for a broker. */
export function generateBrokerQueries(brokerName: string, city: string | null, phones: string[]): string[] {
  const name = (brokerName ?? "").trim();
  const c = (city ?? "").trim();
  const out: string[] = [];
  if (name) {
    if (c) {
      out.push(`${name} מתווך ${c}`);
      out.push(`${name} נדל"ן ${c}`);
      out.push(`${name} ${c} רי/מקס`);
      out.push(`${name} ${c} אנגלו סכסון`);
    }
    out.push(`${name} משרד תיווך`);
  }
  for (const p of phones.slice(0, 2)) if (p) out.push(`${p} מתווך`);
  return Array.from(new Set(out)).slice(0, 8);
}
