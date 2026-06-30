// ============================================================================
// 🌐 Brokerage research providers (Phase 26.13b, PART 2). Server-safe.
// Provider abstraction with a strict structured contract. Web/Google/Facebook/
// LinkedIn require live access we don't have → they report not_configured and
// return nothing (never fabricated). Yad2/Madlan return REAL evidence derived
// from the external_listings rows we ALREADY own (no scraping, no bypass).
// STEP-7 applies: an extracted name equal to the broker's own name is NOT an
// office name.
// ============================================================================
import "server-only";
import { normalizeHebrewName } from "../normalize";
import { detectFranchise } from "../franchise";
import { isAcceptableOfficeName } from "../office-name-guard";
import type { ResearchEvidence, ProviderStatus } from "./types";

export interface ResearchListing {
  source: string | null; listingUrl: string | null; title: string | null;
  contactName: string | null; detectedBrokerName: string | null; contactPhone: string | null;
  city: string | null; neighborhood: string | null;
}
export interface ResearchContext {
  broker: { name: string; normalizedName: string; city: string | null; phones: string[] };
  listings: ResearchListing[];
  queries: string[];
}

export interface BrokerageResearchProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  research(ctx: ResearchContext): Promise<ResearchEvidence[]>;
}

const now = () => new Date().toISOString();
const ON = () => !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;
const phoneRe = /0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/;

// ── Real web-search provider (PART 2 + update). Supports multiple vendors; uses
//    whichever is configured. Returns live results with citations. If NONE is
//    configured it reports not_configured (the UI shows the explicit message).
type SearchHit = { title: string | null; url: string | null; snippet: string | null };
type SearchVendor = { name: string; key: string | undefined; run: (q: string) => Promise<SearchHit[]> };

function searchVendors(): SearchVendor[] {
  return [
    { name: "tavily", key: process.env.TAVILY_API_KEY, run: async (q) => {
      const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: q, max_results: 5, search_depth: "basic" }) });
      if (!r.ok) throw new Error(`tavily ${r.status}`);
      const j = await r.json() as { results?: { title?: string; url?: string; content?: string }[] };
      return (j.results ?? []).map((x) => ({ title: x.title ?? null, url: x.url ?? null, snippet: x.content ?? null }));
    } },
    { name: "serpapi", key: process.env.SERPAPI_API_KEY, run: async (q) => {
      const r = await fetch(`https://serpapi.com/search.json?engine=google&num=5&q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_API_KEY}`);
      if (!r.ok) throw new Error(`serpapi ${r.status}`);
      const j = await r.json() as { organic_results?: { title?: string; link?: string; snippet?: string }[] };
      return (j.organic_results ?? []).map((x) => ({ title: x.title ?? null, url: x.link ?? null, snippet: x.snippet ?? null }));
    } },
    { name: "exa", key: process.env.EXA_API_KEY, run: async (q) => {
      const r = await fetch("https://api.exa.ai/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.EXA_API_KEY ?? "" },
        body: JSON.stringify({ query: q, numResults: 5, contents: { text: true } }) });
      if (!r.ok) throw new Error(`exa ${r.status}`);
      const j = await r.json() as { results?: { title?: string; url?: string; text?: string }[] };
      return (j.results ?? []).map((x) => ({ title: x.title ?? null, url: x.url ?? null, snippet: (x.text ?? "").slice(0, 300) || null }));
    } },
    { name: "bing", key: process.env.BING_SEARCH_KEY, run: async (q) => {
      const r = await fetch(`https://api.bing.microsoft.com/v7.0/search?count=5&q=${encodeURIComponent(q)}`, { headers: { "Ocp-Apim-Subscription-Key": process.env.BING_SEARCH_KEY ?? "" } });
      if (!r.ok) throw new Error(`bing ${r.status}`);
      const j = await r.json() as { webPages?: { value?: { name?: string; url?: string; snippet?: string }[] } };
      return (j.webPages?.value ?? []).map((x) => ({ title: x.name ?? null, url: x.url ?? null, snippet: x.snippet ?? null }));
    } },
    { name: "google_cse", key: process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX ? "1" : undefined, run: async (q) => {
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?num=5&key=${process.env.GOOGLE_CSE_KEY}&cx=${process.env.GOOGLE_CSE_CX}&q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error(`google_cse ${r.status}`);
      const j = await r.json() as { items?: { title?: string; link?: string; snippet?: string }[] };
      return (j.items ?? []).map((x) => ({ title: x.title ?? null, url: x.link ?? null, snippet: x.snippet ?? null }));
    } },
  ];
}
/** The active search vendor (first configured), or null. */
export function activeSearchVendor(): SearchVendor | null {
  return searchVendors().find((v) => !!v.key) ?? null;
}

const webSearchProvider: BrokerageResearchProvider = {
  id: "web_search", label: "חיפוש ציבורי (Tavily/SerpAPI/Exa/Bing/Google)",
  isConfigured: () => ON() && !!activeSearchVendor(),
  async research(ctx) {
    const vendor = activeSearchVendor();
    if (!vendor) return [];
    const out: ResearchEvidence[] = [];
    for (const q of ctx.queries.slice(0, 4)) {                 // rate-limit: cap queries
      let hits: SearchHit[] = [];
      try { hits = await vendor.run(q); } catch (e) { console.error("[research] web search failed", q, e); continue; }
      for (const h of hits.slice(0, 5)) {
        const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
        const fr = detectFranchise(text);
        const dom = h.url ? (h.url.toLowerCase().match(/^https?:\/\/([^/]+)/)?.[1]?.replace(/^www\./, "") ?? null) : null;
        out.push({
          provider: "web_search", query: q, url: h.url, title: h.title, snippet: h.snippet,
          extractedOfficeName: fr.matched && normalizeHebrewName(fr.brandNetwork) !== ctx.broker.normalizedName ? fr.brandNetwork : null,
          extractedBrokerName: null, extractedPhone: text.match(phoneRe)?.[0] ?? null, extractedWebsite: dom,
          confidence: 65, evidenceText: text.slice(0, 300) || null, fetchedAt: now(),
        });
      }
    }
    return out;
  },
};

// Google Business / Facebook / LinkedIn — require dedicated APIs we don't have.
function stub(id: string, label: string, flag: string): BrokerageResearchProvider {
  return { id, label, isConfigured: () => ON() && !!process.env[flag], async research() { return []; } };
}
const googleBusinessProvider = stub("google_business", "Google Business", "ZONO_GOOGLE_BUSINESS_KEY");
const facebookProvider = stub("facebook", "Facebook", "ZONO_FACEBOOK_KEY");
const linkedinProvider = stub("linkedin", "LinkedIn", "ZONO_LINKEDIN_KEY");

// ── Listing-source providers — REAL evidence from data we already hold. ──────
function listingSourceProvider(id: string, label: string, sourceMatch: RegExp): BrokerageResearchProvider {
  return {
    id, label,
    isConfigured: () => true, // operates on data we own; always available
    async research(ctx) {
      const out: ResearchEvidence[] = [];
      for (const l of ctx.listings) {
        if (!sourceMatch.test(l.source ?? "")) continue;
        const detected = l.detectedBrokerName?.trim() || null;
        // STEP 7 — an extracted name equal to the broker's own name is NOT an office.
        const officeName = detected && normalizeHebrewName(detected) !== ctx.broker.normalizedName ? detected : null;
        const dom = l.listingUrl ? (l.listingUrl.toLowerCase().match(/^https?:\/\/([^/]+)/)?.[1]?.replace(/^www\./, "") ?? null) : null;
        out.push({
          provider: id,
          query: null,
          url: l.listingUrl,
          title: l.title,
          snippet: [l.neighborhood, l.city].filter(Boolean).join(", ") || null,
          extractedOfficeName: officeName,
          extractedBrokerName: l.contactName || detected || null,
          extractedPhone: l.contactPhone,
          extractedWebsite: dom,
          confidence: officeName ? 70 : 55,
          evidenceText: `מודעה ב-${l.source} ${officeName ? `· משרד נצפה: ${officeName}` : "· ללא שם משרד שזוהה"}`,
          fetchedAt: now(),
        });
      }
      return out;
    },
  };
}
const yad2Provider = listingSourceProvider("yad2", "יד2", /yad2/i);
const madlanProvider = listingSourceProvider("madlan", "מדלן", /madlan/i);

export const RESEARCH_PROVIDERS: BrokerageResearchProvider[] = [
  webSearchProvider, googleBusinessProvider, facebookProvider, linkedinProvider, yad2Provider, madlanProvider,
];

/** Run every provider; collect evidence + per-provider status. Never throws. */
export async function gatherResearchEvidence(ctx: ResearchContext): Promise<{ evidence: ResearchEvidence[]; providers: ProviderStatus[]; publicResults: number }> {
  const evidence: ResearchEvidence[] = [];
  const providers: ProviderStatus[] = [];
  for (const p of RESEARCH_PROVIDERS) {
    const configured = p.isConfigured();
    if (!configured) { providers.push({ provider: p.id, label: p.label, configured: false, skippedReason: "not_configured", resultCount: 0 }); continue; }
    try {
      const ev = await p.research(ctx);
      evidence.push(...ev);
      providers.push({ provider: p.id, label: p.label, configured: true, skippedReason: null, resultCount: ev.length });
    } catch (e) {
      providers.push({ provider: p.id, label: p.label, configured: true, skippedReason: e instanceof Error ? e.message : "provider_error", resultCount: 0 });
    }
  }
  return { evidence, providers, publicResults: evidence.length };
}

/** Group evidence into possible offices (excluding self-name). Pure-ish helper. */
export function derivePossibleOffices(evidence: ResearchEvidence[], normalizedBrokerName: string): { officeName: string; brandNetwork: string | null; confidence: number; sources: string[] }[] {
  const byName = new Map<string, { officeName: string; brandNetwork: string | null; confidence: number; sources: Set<string> }>();
  for (const e of evidence) {
    const name = e.extractedOfficeName?.trim();
    if (!name) continue;
    if (normalizeHebrewName(name) === normalizedBrokerName) continue; // STEP 7
    if (!isAcceptableOfficeName(name)) continue; // GUARD 26.13c: require brand/office keyword
    const key = normalizeHebrewName(name);
    const fr = detectFranchise(name);
    let c = byName.get(key);
    if (!c) { c = { officeName: fr.matched ? fr.brandNetwork : name, brandNetwork: fr.matched ? fr.brandNetwork : null, confidence: 0, sources: new Set() }; byName.set(key, c); }
    c.sources.add(e.provider);
    c.confidence = Math.max(c.confidence, e.confidence);
  }
  return [...byName.values()].map((c) => ({ officeName: c.officeName, brandNetwork: c.brandNetwork, confidence: c.confidence, sources: [...c.sources] }))
    .sort((a, b) => b.confidence - a.confidence);
}
