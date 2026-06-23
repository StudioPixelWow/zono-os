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
  providerIsOpenAI, buildSourceManifest, buildAdPrompt, generateAdImageRaw, runCreativeQA, refUrlsFor,
  type AdSpec, type AdGenAssets, type AdKind,
} from "./openai-ad-pipeline";
import {
  deriveCritical, decideApproval, buildCorrectionPrompt,
  type QaScores, type QaCritical, type QaVisionFindings, type SourceManifest,
} from "./creative-qa";

type DB = Awaited<ReturnType<typeof createClient>>;
const MAX_ATTEMPTS = 5;

export interface AdGenOutcome {
  status: "approved" | "manual_review" | "no_provider";
  generationId: string | null; imageUrl: string | null; provider: string;
  scores: QaScores | null; attempts: number; failReasons: string[];
}

/** When QA can't run (no vision response), treat everything as failed — we can
 *  never approve an image we couldn't verify. */
function allCriticalFail(): QaCritical {
  return { wrongPhone: true, wrongPrice: true, wrongAgentName: true, wrongCityStreet: true, inventedText: true, brokenHebrewHeadline: true, wrongLogo: true, wrongPerson: true, unreadableCta: true, croppedText: true, rtlFailure: true };
}

/** Code-controlled scores: text/numeric are derived from the deterministic
 *  critical checks (so they gate hard); the rest use the vision sub-scores. */
function assembleScores(findings: QaVisionFindings | null, c: QaCritical): QaScores {
  const base = findings?.scores ?? { textAccuracy: 0, numericAccuracy: 0, brand: 0, layout: 0, readability: 0, assetIntegrity: 0, realEstateRelevance: 0, overall: 0 };
  const textAccuracy = c.brokenHebrewHeadline || c.inventedText || c.wrongAgentName || c.wrongCityStreet ? 0 : 100;
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
}

export async function generateCreativeWithQA(db: DB, p: OrchestratorParams): Promise<AdGenOutcome> {
  // Full-ad generation + QA is an OpenAI capability; otherwise the caller falls back.
  if (!providerIsOpenAI()) return { status: "no_provider", generationId: null, imageUrl: null, provider: "mock", scores: null, attempts: 0, failReasons: ["ספק AI לא מוגדר"] };
  const refUrls = refUrlsFor(p.assets);
  if (!refUrls.length) return { status: "no_provider", generationId: null, imageUrl: null, provider: "openai", scores: null, attempts: 0, failReasons: ["אין נכסים לרפרנס"] };

  const manifest: SourceManifest = buildSourceManifest(p.spec);
  const { data: genRow } = await db.from("creative_generations").insert({
    org_id: p.orgId, property_id: p.propertyId, request_id: p.requestId, kind: p.kind,
    status: "generating", selected_template: p.template ?? null, source_manifest_json: manifest as never, created_by: p.createdBy,
  } as never).select("id").single();
  const generationId = (genRow as { id: string } | null)?.id ?? null;

  let correction = ""; let attempts = 0; const allFail: string[] = [];
  let best: { scores: QaScores; imageUrl: string; attemptId: string } | null = null;

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    attempts = n;
    const prompt = buildAdPrompt(p.spec, p.assets, correction);
    let img: { b64: string; mime: string } | null = null;
    try { img = await generateAdImageRaw(prompt, refUrls); }
    catch (e) { allFail.push(String(e).slice(0, 200)); await recordAttempt(db, { generationId, orgId: p.orgId, n, prompt, correction, imageUrl: null, passed: false, scores: assembleScores(null, allCriticalFail()), failReasons: ["יצירת התמונה נכשלה"], findings: null, manifest, critical: allCriticalFail() }); continue; }

    const path = `${p.orgId}/qa/${generationId ?? "x"}/${n}-${Date.now()}.png`;
    const { error: upErr } = await db.storage.from(p.bucket).upload(path, Buffer.from(img.b64, "base64"), { contentType: img.mime, upsert: true });
    const imageUrl = upErr ? null : db.storage.from(p.bucket).getPublicUrl(path).data.publicUrl;

    const findings = await runCreativeQA(img.b64, manifest, p.assets);
    const critical = findings ? deriveCritical(findings, manifest) : allCriticalFail();
    const scores = assembleScores(findings, critical);
    const decision = decideApproval(scores, critical);

    const attemptId = await recordAttempt(db, { generationId, orgId: p.orgId, n, prompt, correction, imageUrl, passed: decision.passed, scores, failReasons: decision.failReasons, findings, manifest, critical });

    if (decision.passed && imageUrl) {
      if (generationId) await db.from("creative_generations").update({ status: "approved", final_image_url: imageUrl, approved_attempt_id: attemptId, attempts_count: n, overall_score: scores.overall } as never).eq("id", generationId);
      return { status: "approved", generationId, imageUrl, provider: "openai", scores, attempts: n, failReasons: [] };
    }
    if (imageUrl && (!best || scores.overall > best.scores.overall)) best = { scores, imageUrl, attemptId: attemptId ?? "" };
    correction = buildCorrectionPrompt(decision, critical, manifest);
    allFail.push(...decision.failReasons);
  }

  if (generationId) await db.from("creative_generations").update({ status: "manual_review", attempts_count: attempts, overall_score: best?.scores.overall ?? 0 } as never).eq("id", generationId);
  return { status: "manual_review", generationId, imageUrl: best?.imageUrl ?? null, provider: "openai", scores: best?.scores ?? null, attempts, failReasons: Array.from(new Set(allFail)).slice(0, 12) };
}

interface AttemptRecord {
  generationId: string | null; orgId: string; n: number; prompt: string; correction: string;
  imageUrl: string | null; passed: boolean; scores: QaScores; failReasons: string[];
  findings: QaVisionFindings | null; manifest: SourceManifest; critical: QaCritical;
}
async function recordAttempt(db: DB, a: AttemptRecord): Promise<string | null> {
  if (!a.generationId) return null;
  const s = a.scores;
  const { data: att } = await db.from("creative_generation_attempts").insert({
    generation_id: a.generationId, org_id: a.orgId, attempt_number: a.n, prompt: a.prompt, correction_prompt: a.correction || null,
    image_url: a.imageUrl, qa_status: a.passed ? "passed" : "failed",
    qa_report_json: { critical: a.critical, findings: a.findings ? { detectedPhone: a.findings.detectedPhone, detectedPrice: a.findings.detectedPrice, detectedAgentName: a.findings.detectedAgentName, detectedCity: a.findings.detectedCity } : null } as never,
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
