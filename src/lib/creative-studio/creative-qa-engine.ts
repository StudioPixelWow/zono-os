// ============================================================================
// ZONO — Creative QA + Auto-Regeneration ORCHESTRATOR (server-only)
// ----------------------------------------------------------------------------
// generateCreativeWithQA: create a generation record → loop up to 5 attempts
// (generate → vision read-back → DETERMINISTIC pass/fail in creative-qa.ts →
// persist attempt + QA report → build a precise correction prompt → regenerate)
// → return only an APPROVED image, else manual_review. Every attempt + report is
// stored for admin debug; a failing image is NEVER returned as approved.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  providerIsOpenAI, buildSourceManifest, buildAdPrompt, generateAdImageRaw, runCreativeQA, runCreativeDirectorQA, refUrlsFor,
  type AdSpec, type AdGenAssets, type AdKind, type CreativeFindings,
} from "./openai-ad-pipeline";
import {
  deriveCritical, decideApproval, buildCorrectionPrompt, decideCreative, buildCreativeCorrection,
  type QaScores, type QaCritical, type QaVisionFindings, type SourceManifest, type CreativeScores,
} from "./creative-qa";
import { applyCreativeDNAToGenerationPrompt } from "@/lib/creative-dna/generation-integration";
import type { ReferenceStrength } from "@/lib/creative-dna/types";

type DB = Awaited<ReturnType<typeof createClient>>;
// Creative-first but TIME-BOUNDED: slow is fine, but a serverless function has a
// hard wall-clock limit — exceeding it returns a 504 and the user gets NOTHING.
// So we cap attempts AND enforce an overall time budget: we stop starting new
// attempts once there isn't enough time left for another full generation, and
// return the best image so far. Both override via env.
const MAX_ATTEMPTS = Math.max(1, Number(process.env.ZONO_CREATIVE_MAX_ATTEMPTS) || 3);
// Per-ad budget. The 2 final ads run in parallel, so wall-clock ≈ one ad's
// budget. Keep well under Vercel's max (300s on Pro) to leave room for upload +
// QA + the surrounding flow. Override with ZONO_CREATIVE_TOTAL_BUDGET_MS.
const TOTAL_BUDGET_MS = Math.max(60_000, Number(process.env.ZONO_CREATIVE_TOTAL_BUDGET_MS) || 200_000);
// Rough cost of one full attempt (image gen + 2 vision QA calls). If less than
// this remains in the budget, we don't start another attempt.
const ATTEMPT_COST_MS = Math.max(40_000, Number(process.env.ZONO_CREATIVE_ATTEMPT_COST_MS) || 95_000);

export interface AdGenOutcome {
  status: "approved" | "manual_review" | "no_provider";
  generationId: string | null; imageUrl: string | null; provider: string;
  scores: QaScores | null; creativeWow: number | null; attempts: number; failReasons: string[];
  /** Shown to the user when the best creative is returned without a clean QA pass. */
  warning: string | null;
}

/** Warning surfaced when the retry budget is exhausted (spec §5). */
const REVIEW_WARNING = "נדרש לעבור על פרטי המודעה לפני פרסום";

/** When QA can't run (no vision response), treat everything as failed — we can
 *  never approve an image we couldn't verify. */
function allCriticalFail(): QaCritical {
  return { saleLabelMissing: true, addressNotVisible: true, wrongPhone: true, wrongPrice: true, wrongAgentName: true, wrongCityStreet: true, inventedText: true, brokenHebrewHeadline: true, wrongLogo: true, wrongPerson: true, unreadableCta: true, croppedText: true, rtlFailure: true };
}

/** Code-controlled scores: text/numeric are derived from the deterministic
 *  critical checks (so they gate hard); the rest use the vision sub-scores. */
function assembleScores(findings: QaVisionFindings | null, c: QaCritical): QaScores {
  const base = findings?.scores ?? { textAccuracy: 0, numericAccuracy: 0, brand: 0, layout: 0, readability: 0, assetIntegrity: 0, realEstateRelevance: 0, overall: 0 };
  const textAccuracy = c.brokenHebrewHeadline || c.inventedText || c.wrongAgentName || c.wrongCityStreet || c.saleLabelMissing || c.addressNotVisible ? 0 : 100;
  const numericAccuracy = c.wrongPhone || c.wrongPrice ? 0 : 100;
  const assetIntegrity = c.wrongLogo || c.wrongPerson ? Math.min(base.assetIntegrity, 40) : base.assetIntegrity;
  const layout = c.croppedText || c.rtlFailure ? Math.min(base.layout, 40) : base.layout;
  const readability = c.unreadableCta ? Math.min(base.readability, 40) : base.readability;
  const overall = Math.round(0.25 * textAccuracy + 0.2 * numericAccuracy + 0.15 * base.brand + 0.15 * layout + 0.1 * readability + 0.1 * assetIntegrity + 0.05 * base.realEstateRelevance);
  return { textAccuracy, numericAccuracy, brand: base.brand, layout, readability, assetIntegrity, realEstateRelevance: base.realEstateRelevance, overall };
}

interface OrchestratorParams {
  orgId: string; propertyId: string | null; requestId: string | null; createdBy: string | null;
  kind: AdKind; template?: string | null; spec: AdSpec; assets: AdGenAssets; bucket: string;
  // Creative DNA selection — applies a ready org DNA profile or a code preset to
  // the art direction (resolved+logged once). When omitted, the org DEFAULT
  // ready profile (if any) is applied automatically.
  dna?: { profileId?: string | null; presetKey?: string | null; strength?: ReferenceStrength };
}

export async function generateCreativeWithQA(db: DB, p: OrchestratorParams): Promise<AdGenOutcome> {
  // Full-ad generation + QA is an OpenAI capability; otherwise the caller falls back.
  if (!providerIsOpenAI()) return { status: "no_provider", generationId: null, imageUrl: null, provider: "mock", scores: null, creativeWow: null, attempts: 0, failReasons: ["ספק AI לא מוגדר"], warning: null };
  const refUrls = refUrlsFor(p.assets);
  if (!refUrls.length) return { status: "no_provider", generationId: null, imageUrl: null, provider: "openai", scores: null, creativeWow: null, attempts: 0, failReasons: ["אין נכסים לרפרנס"], warning: null };

  const manifest: SourceManifest = buildSourceManifest(p.spec);
  const { data: genRow } = await db.from("creative_generations").insert({
    org_id: p.orgId, property_id: p.propertyId, request_id: p.requestId, kind: p.kind,
    status: "generating", selected_template: p.template ?? null, source_manifest_json: manifest as never, created_by: p.createdBy,
  } as never).select("id").single();
  const generationId = (genRow as { id: string } | null)?.id ?? null;

  // CREATIVE DNA: resolve the Style-DNA prompt block ONCE (and log which DNA was
  // applied into creative_generation_references). The block influences ART
  // DIRECTION ONLY — never the locked source data — so it's a stable suffix
  // appended to every attempt's prompt. Best-effort: failure never blocks.
  let dnaSuffix = "";
  try {
    const applied = await applyCreativeDNAToGenerationPrompt("", {
      profileId: p.dna?.profileId ?? null, presetKey: p.dna?.presetKey ?? null,
      strength: p.dna?.strength, propertyId: p.propertyId, generationId, log: true,
    });
    if (applied.applied) dnaSuffix = applied.prompt; // begins with "\n\n# CREATIVE DNA …"
  } catch { /* DNA is additive — never block generation on it */ }

  let correction = ""; let attempts = 0; const allFail: string[] = [];
  // SELF-CORRECTION pipeline (AI-only — no canvas, no overlay, no local editing):
  // we keep the BEST generated image (highest overall, creativeWow as tiebreak)
  // so after MAX_ATTEMPTS we return the strongest candidate with a review warning
  // — never blocking the user.
  type BestCandidate = { scores: QaScores; creativeWow: number | null; imageUrl: string };
  let best: BestCandidate | null = null;
  // Creative-first ranking: the Creative Director's WOW dominates; correctness
  // overall is a light tiebreaker.
  const bestRank = (c: BestCandidate) => (c.creativeWow ?? 0) * 10 + c.scores.overall;
  let prevImageUrl: string | null = null;
  const startedAt = Date.now();

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    // TIME BUDGET: never start an attempt we don't have time to finish — that is
    // what causes the 504 (function killed mid-generation). After attempt #1, if
    // less than one attempt's worth of budget remains, stop and return the best.
    if (n > 1 && Date.now() - startedAt > TOTAL_BUDGET_MS - ATTEMPT_COST_MS) {
      allFail.push("תקציב הזמן מוצה — מחזיר את הגרסה הטובה ביותר");
      break;
    }
    attempts = n;
    const prompt = buildAdPrompt(p.spec, p.assets, correction) + dnaSuffix;
    // On a correction pass, ATTACH the previous generated image as the base to
    // edit (first ref) so OpenAI fixes ONLY the flagged text and preserves the
    // layout/composition/branding — it never redesigns or starts a new concept.
    const callRefs = correction && prevImageUrl ? [prevImageUrl, ...refUrls].slice(0, 6) : refUrls;
    let img: { b64: string; mime: string } | null = null;
    try { img = await generateAdImageRaw(prompt, callRefs); }
    catch (e) { allFail.push(String(e).slice(0, 200)); await recordAttempt(db, { generationId, orgId: p.orgId, n, prompt, correction, imageUrl: null, passed: false, scores: assembleScores(null, allCriticalFail()), failReasons: ["יצירת התמונה נכשלה"], findings: null, manifest, critical: allCriticalFail(), creative: null }); continue; }

    const path = `${p.orgId}/qa/${generationId ?? "x"}/${n}-${Date.now()}.png`;
    const { error: upErr } = await db.storage.from(p.bucket).upload(path, Buffer.from(img.b64, "base64"), { contentType: img.mime, upsert: true });
    const imageUrl = upErr ? null : db.storage.from(p.bucket).getPublicUrl(path).data.publicUrl;
    if (imageUrl) prevImageUrl = imageUrl;

    // CREATIVE-FIRST MODE — the Creative Director outranks the QA checklist.
    // Correctness QA still runs, but ONLY hard DATA errors (wrong phone/price/
    // agent/city, broken Hebrew, missing sale-label/address, wrong logo/face) can
    // block; the soft score thresholds no longer gate. The Creative Director
    // (desirability) is the primary approval gate — a beautiful, art-directed ad
    // is the goal, never a "correct but templated" one.
    const findings = await runCreativeQA(img.b64, manifest, p.assets);
    const critical = findings ? deriveCritical(findings, manifest) : allCriticalFail();
    const scores = assembleScores(findings, critical);
    const decision = decideApproval(scores, critical);
    const criticalClean = decision.criticalFailures.length === 0;

    // LAYER 2 — Creative QA runs EVERY attempt (the primary gate), not gated on
    // the correctness checklist.
    const creative: CreativeFindings | null = await runCreativeDirectorQA(img.b64);
    const creativeDecision = creative
      ? decideCreative(creative.scores, creative.hardFails, creative.proudToPublish)
      : { passed: false, reasons: ["Creative QA לא זמין"], hardFailures: [] as string[] };

    // Approve when the Creative Director is proud AND no critical DATA error remains.
    const approved = creativeDecision.passed && criticalClean;
    const combinedFail = [...decision.criticalFailures, ...creativeDecision.reasons];

    const attemptId = await recordAttempt(db, { generationId, orgId: p.orgId, n, prompt, correction, imageUrl, passed: approved, scores, failReasons: combinedFail, findings, manifest, critical, creative: creative?.scores ?? null });

    if (approved && imageUrl) {
      if (generationId) await db.from("creative_generations").update({ status: "approved", final_image_url: imageUrl, approved_attempt_id: attemptId, attempts_count: n, overall_score: creative?.scores.overallWow ?? scores.overall } as never).eq("id", generationId);
      return { status: "approved", generationId, imageUrl, provider: "openai", scores, creativeWow: creative?.scores.overallWow ?? null, attempts: n, failReasons: [], warning: null };
    }
    // Keep the BEST generated image (ranked by creative WOW first) so the retry
    // budget returns the strongest candidate, never blocking the user.
    if (imageUrl) {
      const cand: BestCandidate = { scores, creativeWow: creative?.scores.overallWow ?? null, imageUrl };
      if (!best || bestRank(cand) > bestRank(best)) best = cand;
    }
    // Next correction — CREATIVE FIRST: redesign for desirability unless a hard
    // DATA error must be fixed; then it's a light text-only correction.
    if (creative && !creativeDecision.passed) correction = buildCreativeCorrection(creative.scores, creative.hardFails);
    else if (!criticalClean) correction = buildCorrectionPrompt(decision, critical, manifest);
    allFail.push(...combinedFail);
  }

  // Retry budget (initial + 2 corrections) exhausted — RETURN THE BEST generation
  // with a review warning (spec §5). Never block the user; never edit outside AI.
  if (generationId) await db.from("creative_generations").update({ status: "manual_review", attempts_count: attempts, final_image_url: best?.imageUrl ?? null, overall_score: best?.scores.overall ?? 0 } as never).eq("id", generationId);
  return { status: "manual_review", generationId, imageUrl: best?.imageUrl ?? null, provider: "openai", scores: best?.scores ?? null, creativeWow: best?.creativeWow ?? null, attempts, failReasons: Array.from(new Set(allFail)).slice(0, 12), warning: best?.imageUrl ? REVIEW_WARNING : null };
}

interface AttemptRecord {
  generationId: string | null; orgId: string; n: number; prompt: string; correction: string;
  imageUrl: string | null; passed: boolean; scores: QaScores; failReasons: string[];
  findings: QaVisionFindings | null; manifest: SourceManifest; critical: QaCritical; creative: CreativeScores | null;
}
async function recordAttempt(db: DB, a: AttemptRecord): Promise<string | null> {
  if (!a.generationId) return null;
  const s = a.scores;
  const { data: att } = await db.from("creative_generation_attempts").insert({
    generation_id: a.generationId, org_id: a.orgId, attempt_number: a.n, prompt: a.prompt, correction_prompt: a.correction || null,
    image_url: a.imageUrl, qa_status: a.passed ? "passed" : "failed",
    qa_report_json: { critical: a.critical, creative: a.creative, findings: a.findings ? { detectedPhone: a.findings.detectedPhone, detectedPrice: a.findings.detectedPrice, detectedAgentName: a.findings.detectedAgentName, detectedCity: a.findings.detectedCity } : null } as never,
    text_accuracy_score: s.textAccuracy, numeric_accuracy_score: s.numericAccuracy, brand_score: s.brand, layout_score: s.layout,
    readability_score: s.readability, asset_integrity_score: s.assetIntegrity, real_estate_relevance_score: s.realEstateRelevance, overall_score: s.overall,
    fail_reasons: a.failReasons as never,
  } as never).select("id").single();
  const attemptId = (att as { id: string } | null)?.id ?? null;
  if (attemptId) {
    const mismatches = Object.entries(a.critical).filter(([, v]) => v).map(([k]) => k);
    await db.from("creative_qa_reports").insert({
      generation_id: a.generationId, attempt_id: attemptId, org_id: a.orgId,
      ocr_text: a.findings?.ocrText ?? null, expected_text_manifest: a.manifest as never,
      mismatches_json: mismatches as never, critical_failures_json: a.failReasons as never,
      visual_findings_json: (a.findings ?? {}) as never, score_json: s as never, passed: a.passed,
    } as never);
  }
  return attemptId;
}
