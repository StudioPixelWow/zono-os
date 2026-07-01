// ============================================================================
// 🧠 Brokerage Research Agent™ v1 — orchestrator (server-only). Phase 26.4.13.
// ----------------------------------------------------------------------------
// A staged, human-like research loop: understand the city → franchises →
// independents → directories → portals → social → cross-reference. AI plans/
// extracts/dedupes; only PUBLIC evidence verifies. Save-first (researching) so
// results are visible immediately; verify best-effort within a time budget;
// resumable (a rerun continues). Reuses the persistent KB. No schema change.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { selectProvider } from "@/lib/ai-reasoning/gateway";
import { activeSearchVendor } from "../broker-research/providers";
import { isAcceptableOfficeName } from "../office-name-guard";
import { proposeSystem, proposeUser } from "./prompts";
import { stageQueries, runQuery, type Hit } from "./search";
import { extractNames } from "./extractor";
import { mergeNames } from "./dedupe";
import { verifyOffice, systemConfidenceFrom } from "./verifier";
import { loadExisting, saveResearching, updateVerification, promoteOffice, normCity } from "./repository";
import { computeGaps, STAGE_HE } from "./explain";
import {
  DEPTH_CONFIG, RESEARCH_AGENT_VERSION,
  type AgentOptions, type AgentReport, type AgentCandidate, type DiscoveredName,
  type ResearchStage, type SearchRecord,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Official entry — run the multi-step brokerage research agent for a city. */
export async function runBrokerageResearchAgent(orgId: string, cityRaw: string, options: AgentOptions = {}): Promise<AgentReport> {
  const t0 = Date.now();
  const db = createServiceRoleClient();
  const cityLabel = cityRaw.trim();
  const cityNorm = normCity(cityRaw);
  const depth = options.depth ?? "standard";
  const cfg = DEPTH_CONFIG[depth];
  const budgetMs = options.budgetMs ?? cfg.budgetMs;
  const maxSearches = options.maxSearches ?? cfg.maxSearches;
  const maxCandidates = options.maxCandidates ?? 60;

  const provider = selectProvider();
  const vendor = activeSearchVendor();

  const steps: string[] = ["התחיל"];
  const notes: string[] = [];
  const searches: SearchRecord[] = [];
  const discovered: DiscoveredName[] = [];
  const stagesRun: ResearchStage[] = [];
  const emptyStages: ResearchStage[] = [];

  const report: AgentReport = {
    city: cityLabel, cityNormalized: cityNorm, depth,
    aiConfigured: !!provider, searchConfigured: !!vendor,
    stagesRun, searches, searchesCompleted: 0, sourcesChecked: 0, knownBefore: 0,
    candidatesFound: 0, candidatesSaved: 0, candidatesVerified: 0, candidatesResearching: 0,
    candidatesWaitingForEvidence: 0, candidatesRejected: 0,
    candidates: [], gaps: [], steps, timedOut: false, elapsedMs: 0, notes, version: RESEARCH_AGENT_VERSION,
  };

  // ── Reuse the persistent KB before researching ────────────────────────────
  const existing = await loadExisting(db, orgId, cityRaw);
  report.knownBefore = existing.knownBefore;
  steps.push(`ידע קיים: ${existing.knownBefore} משרדים/מועמדים`);

  // ── AI enrichment: propose names up-front (one call, best-effort) ─────────
  if (provider) {
    try {
      const text = await Promise.race([
        provider.complete({ system: proposeSystem(), user: proposeUser(cityLabel) }),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 18000)),
      ]);
      const arr = (JSON.parse(text) as { names?: unknown }).names;
      if (Array.isArray(arr)) for (const it of arr) { const nm = s((it as Row).name).trim(); if (nm) discovered.push({ raw: nm, stage: "city_understanding", url: null, snippet: null, brand: s((it as Row).brand).trim() || null, branch: s((it as Row).branch).trim() || null, aiConfidence: 55 }); }
      steps.push(`AI הציע ${Array.isArray(arr) ? arr.length : 0} שמות`);
    } catch (e) { notes.push(`הצעת AI נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`); }
  }

  // ── Staged public search (Stages 1–6). Parallel within a stage; ──────────
  //    stop when out of search budget or wall-clock (~60% reserved for search).
  const searchDeadline = t0 + budgetMs * 0.6;
  if (vendor) {
    for (const { stage, queries } of stageQueries(cityLabel, options)) {
      if (report.searchesCompleted >= maxSearches || Date.now() > searchDeadline) { report.timedOut = true; break; }
      stagesRun.push(stage);
      steps.push(`שלב: ${STAGE_HE[stage]}`);
      const budgetQ = Math.max(1, maxSearches - report.searchesCompleted);
      const runNow = queries.slice(0, budgetQ);
      const results = await Promise.all(runNow.map((q) => runQuery(vendor, stage, q)));
      let stageHits = 0;
      const hits: Hit[] = [];
      for (const r of results) { searches.push(r.record); report.searchesCompleted++; report.sourcesChecked++; stageHits += r.record.hits; hits.push(...r.hits); }
      if (stageHits === 0) emptyStages.push(stage);
      discovered.push(...await extractNames(provider, cityLabel, stage, hits));
    }
  } else {
    notes.push("אין ספק חיפוש ציבורי — הופעל חילוץ מהצעות ה-AI בלבד (Tavily/SerpAPI/Exa/Bing/Google).");
  }

  // ── Merge / dedupe (Hebrew/English/brand/branch variants) ─────────────────
  const stageByKey = new Map<string, ResearchStage>();
  const aiConfByKey = new Map<string, number>();
  for (const d of discovered) {
    const merged = mergeNames([{ raw: d.raw }], cityLabel)[0];
    if (!merged) continue;
    if (!stageByKey.has(merged.key)) stageByKey.set(merged.key, d.stage);
    aiConfByKey.set(merged.key, Math.max(aiConfByKey.get(merged.key) ?? 0, d.aiConfidence));
  }
  let merged = mergeNames(discovered.map((d) => ({ raw: d.raw })), cityLabel);
  // Reject obvious non-offices / person names.
  const rejected = merged.filter((m) => !isAcceptableOfficeName(m.officeName));
  report.candidatesRejected = rejected.length;
  merged = merged.filter((m) => isAcceptableOfficeName(m.officeName)).slice(0, maxCandidates);
  report.candidatesFound = merged.length;
  steps.push(`מועמדים ייחודיים לאחר איחוד: ${merged.length} (נדחו ${rejected.length})`);

  // ── SAVE-FIRST: persist every new candidate as "researching" now ──────────
  const nowIso = new Date().toISOString();
  const cands: { m: typeof merged[number]; ac: AgentCandidate }[] = [];
  for (const m of merged) {
    const key = `${m.normalizedBrand}|${m.normalizedName}|${cityNorm}`;
    const stage = stageByKey.get(m.key) ?? "city_understanding";
    const aiConf = aiConfByKey.get(m.key) ?? 55;
    const ac: AgentCandidate = {
      name: m.aliases[0] ?? m.officeName, officeName: m.officeName, normalizedName: m.normalizedName,
      normalizedBrand: m.normalizedBrand, brandNetwork: m.brandNetwork, branch: m.branch, aliases: m.aliases,
      stage, status: "researching", saved: false, researched: false, candidateId: null,
      aiExtractionConfidence: aiConf, systemConfidence: 0,
      sourcesChecked: [], evidenceFound: [], publicUrls: [], phone: null,
      verdictReason: "נשמר כמועמד למחקר (סוכן מחקר)",
    };
    if (existing.candidateKeys.has(key)) { ac.saved = true; ac.verdictReason = "כבר קיים כמועמד/משרד בעיר"; }
    else {
      const id = await saveResearching(db, cityLabel, m, stage, aiConf, nowIso);
      if (id === null) notes.push(`שמירת מועמד נכשלה: ${m.officeName}`);
      else { ac.saved = true; ac.candidateId = id || null; existing.candidateKeys.add(key); if (id) report.candidatesSaved++; }
    }
    cands.push({ m, ac });
    report.candidates.push(ac);
  }
  steps.push(`נשמרו ${report.candidatesSaved} מועמדים חדשים כ״במחקר״`);

  // ── VERIFY (Stage 7) best-effort within the remaining budget ──────────────
  if (vendor && options.verifyCandidates !== false) {
    let verified = 0;
    for (const { m, ac } of cands) {
      if (!ac.saved) continue;
      if (verified >= cfg.verifyCap || Date.now() - t0 > budgetMs) { if (Date.now() - t0 > budgetMs) report.timedOut = true; continue; }
      const v = await verifyOffice(vendor, ac.name, cityLabel, m.normalizedBrand !== "independent", depth === "deep" ? 3 : 2);
      verified++; ac.researched = true; report.sourcesChecked += v.sourcesChecked.length;
      ac.systemConfidence = systemConfidenceFrom(v);
      ac.sourcesChecked = v.sourcesChecked; ac.evidenceFound = v.evidenceFound; ac.publicUrls = v.publicUrls; ac.phone = v.phone;
      if (ac.candidateId) await updateVerification(db, ac.candidateId, cityLabel, m, ac.stage, ac.aiExtractionConfidence, ac.systemConfidence, v.proven, v);
      if (v.proven) {
        const officeId = await promoteOffice(db, existing.officeByNorm, m, cityLabel, v.phone, ac.systemConfidence, v, nowIso);
        if (officeId) { ac.status = "verified"; report.candidatesVerified++; existing.officeByNorm.set(m.normalizedName, { id: officeId, normalized_name: m.normalizedName, city: cityLabel, status: "active" }); ac.verdictReason = `אומת ע"י ראיות ציבוריות: ${v.strong} מקור/ות חזק/ים · ${v.domains.size} דומיינים`; }
        else { report.candidatesResearching++; ac.verdictReason = "ראיה נמצאה אך יצירת המשרד נכשלה — נשאר ב'מחקר'"; }
      } else { report.candidatesResearching++; ac.verdictReason = vendor ? "אין עדיין ראיה ציבורית חזקה — נשאר ב'מחקר'" : "ממתין לאימות"; }
    }
  }
  report.candidatesWaitingForEvidence = cands.filter((x) => x.ac.saved && !x.ac.researched && x.ac.status !== "verified").length;

  // ── Finalize ──────────────────────────────────────────────────────────────
  report.gaps = computeGaps({
    searchConfigured: !!vendor, aiConfigured: !!provider,
    candidatesSaved: report.candidatesSaved, candidatesVerified: report.candidatesVerified,
    candidatesWaiting: report.candidatesWaitingForEvidence, emptyStages, timedOut: report.timedOut,
  });
  if (report.timedOut) notes.push("הפעולה התחילה אך עשויה להמשיך בהרצה הבאה / ידנית — חלק מהמועמדים ממתינים לאימות.");
  const rank = (c: AgentCandidate) => (c.status === "verified" ? 0 : c.status === "researching" ? 1 : 2);
  report.candidates.sort((a, b) => rank(a) - rank(b) || b.systemConfidence - a.systemConfidence || b.aiExtractionConfidence - a.aiExtractionConfidence);
  steps.push("הסתיים");
  report.elapsedMs = Date.now() - t0;
  return report;
}
