// ============================================================================
// 🤖 AI Candidate Seeding for the Brokerage Census™ (Phase 26.4.11). Server-only.
// ----------------------------------------------------------------------------
// OpenAI is NOT a source of truth. It may ONLY *propose* candidate office names.
// Every proposed name is then verified against PUBLIC sources before it can ever
// be promoted to a real office. Unverified AI candidates stay in "researching",
// never "verified". AI confidence is kept SEPARATE from system confidence and is
// never used to verify. Never overwrites existing offices; never creates dupes.
// Does NOT touch BIE / MAI / valuation / confidence formulas / DB schema.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { detectFranchise } from "./franchise";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { activeSearchVendor } from "./broker-research/providers";
import { selectProvider } from "@/lib/ai-reasoning/gateway";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normCity(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const urlDomain = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };
const phoneRe = /(?:0\d|\+972)[\d\s-]{7,12}\d/;
const BROKERAGE_SIGNAL = /תיווך|נדל|מתווכ|נכס|real\s*estate|realty|realtor|re\/?max|remax|anglo|אנגלו|century\s*21|keller|sotheby|נדל"ן/i;

// ── AI seeding output contract (Task 2) ─────────────────────────────────────
export interface AISeedCandidate {
  name: string; possibleBrand: string | null; possibleBranch: string | null;
  reason: string | null; confidenceFromAI: number;   // 0..100, AI's own — NEVER system confidence
}

export interface SeededCandidateResult {
  name: string; officeName: string; normalizedName: string;
  possibleBrand: string | null; possibleBranch: string | null;
  aiReason: string | null; aiConfidence: number;     // kept separate from systemConfidence
  status: "researching" | "verified" | "rejected";
  systemConfidence: number;                          // derived ONLY from public evidence
  sourcesChecked: string[];
  evidenceFound: string[];
  evidenceMissing: string[];
  verdictReason: string;                             // why verified / still researching / rejected
  promotedOfficeId: string | null;
}

export interface AICandidateSeedSummary {
  city: string; cityNormalized: string;
  aiConfigured: boolean; searchConfigured: boolean;
  candidatesGenerated: number;       // raw from AI
  candidatesAfterDedup: number;      // unique + acceptable
  candidatesCreated: number;         // new candidate rows written
  candidatesVerified: number;        // promoted to verified office
  candidatesResearching: number;     // still unproven
  candidatesRejected: number;        // rejected (bad name / proven not a brokerage)
  evidenceFound: number;             // total public evidence items collected
  candidates: SeededCandidateResult[];
  notes: string[];
}

// ── AI seeding prompt (Task 1) ──────────────────────────────────────────────
function seedSystemPrompt(): string {
  return [
    "You are a research assistant that PROPOSES candidate names of real-estate brokerage OFFICES in a given Israeli city.",
    "You are NOT a source of truth. You only suggest names that a human/web search will then verify.",
    "Return ONLY business/office names — never individual agents/people.",
    "Include franchise branches (e.g. RE/MAX, Anglo-Saxon, Century 21) AND independent local offices.",
    "Return STRICT JSON only, matching: {\"candidates\":[{\"name\":string,\"possibleBrand\":string|null,\"possibleBranch\":string|null,\"reason\":string,\"confidenceFromAI\":number}]}.",
    "confidenceFromAI is YOUR own 0-100 guess and has no authority. Aim for 30-50 candidates.",
  ].join(" ");
}
function seedUserPrompt(city: string): string {
  return `List active real estate brokerage offices operating in ${city}, Israel. `
    + `Return only business/office names, not individual agents. Include franchise branches and local offices. `
    + `Return JSON only with up to 50 candidates.`;
}

/** Parse the model's JSON into clean AISeedCandidate[]. Defensive — never throws. */
function parseSeedCandidates(raw: string): AISeedCandidate[] {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return []; }
  const arr = (obj as { candidates?: unknown })?.candidates;
  if (!Array.isArray(arr)) return [];
  const out: AISeedCandidate[] = [];
  for (const c of arr) {
    const o = c as Row;
    const name = s(o.name).trim();
    if (!name) continue;
    const conf = Number(o.confidenceFromAI);
    out.push({
      name,
      possibleBrand: s(o.possibleBrand).trim() || null,
      possibleBranch: s(o.possibleBranch).trim() || null,
      reason: s(o.reason).trim() || null,
      confidenceFromAI: Number.isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : 50,
    });
  }
  return out;
}

/**
 * Seed brokerage office candidates for a city with AI, then verify each against
 * public sources. Best-effort, no-throw. AI never verifies — only public
 * evidence promotes a candidate to a real office.
 */
export async function seedBrokerageOfficeCandidatesWithAI(
  orgId: string, cityRaw: string, opts: { researchCap?: number } = {},
): Promise<AICandidateSeedSummary> {
  const db = createServiceRoleClient();
  const cityLabel = cityRaw.trim();
  const cityNorm = normCity(cityRaw);
  const notes: string[] = [];
  const researchCap = opts.researchCap ?? 30;

  const provider = selectProvider();
  const vendor = activeSearchVendor();
  const summary: AICandidateSeedSummary = {
    city: cityLabel, cityNormalized: cityNorm,
    aiConfigured: !!provider, searchConfigured: !!vendor,
    candidatesGenerated: 0, candidatesAfterDedup: 0, candidatesCreated: 0,
    candidatesVerified: 0, candidatesResearching: 0, candidatesRejected: 0,
    evidenceFound: 0, candidates: [], notes,
  };
  if (!provider) { notes.push("מנוע ה-AI אינו מוגדר (חסר OPENAI_API_KEY) — לא ניתן להציע מועמדים."); return summary; }

  // ── 1) Ask AI to PROPOSE names (never authoritative) ──────────────────────
  let proposed: AISeedCandidate[] = [];
  try {
    const text = await Promise.race([
      provider.complete({ system: seedSystemPrompt(), user: seedUserPrompt(cityLabel) }),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25000)),
    ]);
    proposed = parseSeedCandidates(text);
  } catch (e) { notes.push(`קריאת ה-AI נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`); return summary; }
  summary.candidatesGenerated = proposed.length;
  if (proposed.length === 0) { notes.push("ה-AI לא החזיר מועמדים."); return summary; }

  // ── 2) Normalize + dedupe + reject obvious non-offices/person names ───────
  const seen = new Set<string>();
  const clean: { c: AISeedCandidate; officeName: string; normalizedName: string; normalizedBrand: string; brandNetwork: string | null; key: string }[] = [];
  for (const c of proposed) {
    if (!isAcceptableOfficeName(c.name)) {
      summary.candidates.push(rejected(c, "שם נדחה (אינו שם משרד תקין / שם אדם)"));
      summary.candidatesRejected++;
      continue;
    }
    const fr = detectFranchise(c.name);
    const officeName = fr.matched ? `${fr.brandNetwork} ${cityLabel}` : c.name.trim();
    const normalizedName = normalizeHebrewName(officeName);
    if (!normalizedName) { summary.candidatesRejected++; summary.candidates.push(rejected(c, "שם לא ניתן לנרמול")); continue; }
    const key = `${fr.normalizedBrand}|${normalizedName}|${cityNorm}`;
    if (seen.has(key)) continue;            // dedupe within this batch
    seen.add(key);
    clean.push({ c, officeName, normalizedName, normalizedBrand: fr.normalizedBrand, brandNetwork: fr.matched ? fr.brandNetwork : null, key });
  }
  summary.candidatesAfterDedup = clean.length;

  // ── 3) Load existing candidate + office keys (never duplicate / overwrite) ─
  const [candRes, offRes] = await Promise.all([
    db.from("brokerage_office_candidates" as never).select("normalized_brand,normalized_name,city").limit(20000),
    db.from("brokerage_offices" as never).select("id,normalized_name,city,status").limit(20000),
  ]);
  const existingCandKeys = new Set(((candRes.data ?? []) as Row[])
    .filter((r) => normCity(s(r.city)) === cityNorm)
    .map((r) => `${s(r.normalized_brand)}|${s(r.normalized_name)}|${cityNorm}`));
  const existingOffices = ((offRes.data ?? []) as Row[]).filter((r) => !s(r.city) || normCity(s(r.city)) === cityNorm);
  const officeByNorm = new Map(existingOffices.map((r) => [s(r.normalized_name), r]));

  const nowIso = new Date().toISOString();
  let researched = 0;

  // ── 4) For each candidate: research public sources, then decide ───────────
  for (const item of clean) {
    const { c, officeName, normalizedName, normalizedBrand, brandNetwork, key } = item;

    // Verify against public sources (bounded). Without a vendor we cannot verify.
    let ver: VerifyResult = { strong: 0, domains: new Set(), evidenceFound: [], sourcesChecked: [], phone: null, items: 0 };
    if (vendor && researched < researchCap) { ver = await verifyCandidate(vendor, c.name, cityLabel, normalizedBrand !== "independent"); researched++; }
    else if (!vendor) ver.evidenceMissingNote = "ספק חיפוש ציבורי אינו מוגדר";
    else ver.evidenceMissingNote = "מעבר למכסת המחקר בריצה זו";
    summary.evidenceFound += ver.evidenceFound.length;

    const independent = ver.domains.size;
    const proven = ver.strong >= 1 || independent >= 2;     // promotion rule (Task 5)
    const systemConfidence = Math.max(0, Math.min(92,
      (ver.strong > 0 ? 30 : 0) + Math.min(2, ver.strong) * 18 + Math.min(3, independent) * 8 + (ver.phone ? 6 : 0)));

    const evidenceMissing: string[] = [];
    if (!ver.evidenceFound.some((e) => /אתר|website/i.test(e))) evidenceMissing.push("אתר רשמי");
    if (!ver.phone) evidenceMissing.push("טלפון");
    if (independent < 2) evidenceMissing.push("מקור ציבורי שני בלתי תלוי");
    if (ver.evidenceMissingNote) evidenceMissing.push(ver.evidenceMissingNote);

    const status: SeededCandidateResult["status"] = proven ? "verified" : "researching";
    const verdict = proven
      ? `אומת ע"י ראיות ציבוריות: ${ver.strong} מקור/ות חזק/ים · ${independent} דומיינים בלתי תלויים`
      : (vendor ? "אין עדיין ראיה ציבורית חזקה — נשאר ב'מחקר'" : "אין ספק חיפוש ציבורי — נשאר ב'מחקר'");

    // Write the candidate row (dedup by brand|name|city). AI source is marked
    // ai_candidate_seed; AI confidence is stored in evidence, NOT as system confidence.
    let promotedOfficeId: string | null = null;
    if (!existingCandKeys.has(key)) {
      const { error } = await db.from("brokerage_office_candidates" as never).insert({
        office_name: officeName, normalized_name: normalizedName,
        brand_network: brandNetwork, normalized_brand: normalizedBrand,
        city: cityLabel, phone: ver.phone, domain: [...ver.domains][0] ?? null,
        suggested_by: "ai_candidate_seed",
        confidence: systemConfidence,           // SYSTEM confidence (evidence-based), not AI's
        status,
        evidence: [{
          source: "ai_candidate_seed", city: cityLabel,
          ai_confidence: c.confidenceFromAI, ai_reason: c.reason,
          possible_brand: c.possibleBrand, possible_branch: c.possibleBranch,
          public_sources_checked: ver.sourcesChecked, evidence_found: ver.evidenceFound,
          strong_sources: ver.strong, independent_domains: independent,
        }] as never,
      } as never).select("id").maybeSingle();
      if (!error) { summary.candidatesCreated++; existingCandKeys.add(key); }
      else if (!/duplicate key/i.test(error.message)) notes.push(`יצירת מועמד AI נכשלה (${officeName}): ${error.message}`);
    }

    // Promote to a REAL office ONLY when proven by public evidence.
    if (proven) {
      promotedOfficeId = await promoteCandidate(db, officeByNorm, normalizedName, officeName, brandNetwork, cityLabel, ver.phone, systemConfidence, c, ver, nowIso);
      if (promotedOfficeId) { summary.candidatesVerified++; officeByNorm.set(normalizedName, { id: promotedOfficeId, normalized_name: normalizedName, city: cityLabel, status: "active" }); }
      else summary.candidatesResearching++;   // promotion failed → still researching
    } else summary.candidatesResearching++;

    summary.candidates.push({
      name: c.name, officeName, normalizedName,
      possibleBrand: c.possibleBrand, possibleBranch: c.possibleBranch,
      aiReason: c.reason, aiConfidence: c.confidenceFromAI,
      status: proven && promotedOfficeId ? "verified" : "researching",
      systemConfidence, sourcesChecked: ver.sourcesChecked,
      evidenceFound: ver.evidenceFound, evidenceMissing,
      verdictReason: verdict, promotedOfficeId,
    });
  }

  if (summary.searchConfigured === false) notes.push("ללא ספק חיפוש ציבורי, מועמדי ה-AI נשארים ב'מחקר' עד שיתווסף מקור אימות (Tavily/SerpAPI/Exa/Bing/Google).");
  summary.candidates.sort((a, b) => b.systemConfidence - a.systemConfidence || b.aiConfidence - a.aiConfidence);
  return summary;
}

function rejected(c: AISeedCandidate, reason: string): SeededCandidateResult {
  return {
    name: c.name, officeName: c.name, normalizedName: "",
    possibleBrand: c.possibleBrand, possibleBranch: c.possibleBranch,
    aiReason: c.reason, aiConfidence: c.confidenceFromAI,
    status: "rejected", systemConfidence: 0, sourcesChecked: [], evidenceFound: [],
    evidenceMissing: [], verdictReason: reason, promotedOfficeId: null,
  };
}

// ── Public-source verification (Task 4) ─────────────────────────────────────
interface VerifyResult {
  strong: number; domains: Set<string>; evidenceFound: string[]; sourcesChecked: string[];
  phone: string | null; items: number; evidenceMissingNote?: string;
}

async function verifyCandidate(
  vendor: NonNullable<ReturnType<typeof activeSearchVendor>>, name: string, city: string, brandKnown: boolean,
): Promise<VerifyResult> {
  const res: VerifyResult = { strong: 0, domains: new Set(), evidenceFound: [], sourcesChecked: [], phone: null, items: 0 };
  const cityNorm = normCity(city);
  const nameTokens = normalizeHebrewName(name).split(/\s+/).filter((t) => t.length >= 2);
  // Bounded query set (run 3 of the 6 templates to cap cost across many candidates).
  const queries = [
    `${name} ${city} תיווך`,
    `${name} ${city} נדל"ן`,
    `${name} טלפון`,
  ];
  const runs = await Promise.all(queries.map(async (q) => {
    res.sourcesChecked.push(q);
    try { return { q, hits: await vendor.run(q) }; } catch { return { q, hits: [] as { title: string | null; url: string | null; snippet: string | null }[] }; }
  }));
  for (const { hits } of runs) {
    for (const h of hits.slice(0, 5)) {
      res.items++;
      const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
      const normText = normalizeHebrewName(text);
      const mentionsName = nameTokens.length > 0 && nameTokens.every((t) => normText.includes(t)) ||
        (brandKnown && detectFranchise(text).matched);
      const brokerage = BROKERAGE_SIGNAL.test(text) || detectFranchise(text).matched;
      const cityHit = normCity(text).includes(cityNorm) && cityNorm.length > 0;
      const dom = h.url ? urlDomain(h.url) : "";
      const ph = text.match(phoneRe)?.[0] ?? null;
      if (mentionsName && dom) res.domains.add(dom);
      if (mentionsName && ph && !res.phone) { const np = normalizePhoneNumber(ph); if (np) { res.phone = np; res.evidenceFound.push(`טלפון נצפה: ${np}`); } }
      if (dom && mentionsName) res.evidenceFound.push(`${/facebook\.com/.test(dom) ? "Facebook" : "אתר/דומיין"}: ${dom}`);
      // Strong = the name + a brokerage signal + (in-city or a real domain/phone).
      if (mentionsName && brokerage && (cityHit || dom || ph)) {
        res.strong++;
        res.evidenceFound.push(`מקור ציבורי חזק: ${(h.title ?? dom ?? "תוצאה").slice(0, 80)}`);
      }
    }
  }
  // De-dup evidence strings.
  res.evidenceFound = [...new Set(res.evidenceFound)].slice(0, 8);
  return res;
}

// ── Promotion (Task 5) — create a real office only when proven; never overwrite ─
async function promoteCandidate(
  db: ReturnType<typeof createServiceRoleClient>, officeByNorm: Map<string, Row>,
  normalizedName: string, officeName: string, brandNetwork: string | null, city: string,
  phone: string | null, confidence: number, c: AISeedCandidate, ver: VerifyResult, nowIso: string,
): Promise<string | null> {
  const existing = officeByNorm.get(normalizedName);
  if (existing && s(existing.status) !== "rejected") {
    // Reuse — DO NOT overwrite. Just touch last_seen_at (continuous learning).
    await db.from("brokerage_offices" as never).update({ last_seen_at: nowIso } as never).eq("id", s(existing.id));
    return s(existing.id);
  }
  if (!isAcceptableOfficeName(officeName)) return null;
  const officeId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_offices" as never).insert({
    id: officeId, name: officeName, normalized_name: normalizedName,
    brand_network: brandNetwork, office_type: "unknown",
    status: "active", city, primary_phone: phone, confidence_score: confidence, data_quality_score: 45,
    metadata: { derived_from: "ai_candidate_seed_verified", ai_confidence: c.confidenceFromAI, strong_sources: ver.strong, independent_domains: ver.domains.size, evidence: ver.evidenceFound } as never,
    first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
  } as never);
  return error ? null : officeId;
}
