// ============================================================================
// ZONO — Creative DNA service (server-only). Orchestrates the reference-ad
// library → analysis → Style DNA lifecycle on top of the repository + analyzer.
//   • profile health (how analysis-ready a profile is)
//   • runAnalysis: Vision-analyze every asset → aggregate → persist Style DNA
//     onto the profile, recording an analysis run + per-asset results.
// Real persistence only; no mock data. Degrades cleanly with no Vision provider.
// ============================================================================
import "server-only";
import { creativeDnaRepository } from "./repository";
import { analyzeAssets, aggregateStyleDna } from "./analyzer";
import {
  MIN_REFERENCES_FOR_STABLE, MIN_REFERENCES_RECOMMENDED, CREATIVE_REFERENCES_BUCKET,
  type CreativeDnaProfileRow, type CreativeReferenceAssetRow,
} from "./types";
import { createClient } from "@/lib/supabase/server";

export interface ProfileHealth {
  assetCount: number; analyzedCount: number;
  ready: boolean; recommended: boolean; stable: boolean;
  status: CreativeDnaProfileRow["status"]; message: string;
}

export function computeProfileHealth(profile: CreativeDnaProfileRow, assets: CreativeReferenceAssetRow[]): ProfileHealth {
  const assetCount = assets.length;
  const analyzedCount = assets.filter((a) => a.analysis_status === "done").length;
  const stable = assetCount >= MIN_REFERENCES_FOR_STABLE;
  const recommended = assetCount >= MIN_REFERENCES_RECOMMENDED;
  const ready = profile.status === "ready" && !!profile.style_prompt;
  const message = !assetCount
    ? "העלה מודעות ייחוס כדי ללמוד סגנון."
    : !stable
      ? `מומלץ לפחות ${MIN_REFERENCES_FOR_STABLE} מודעות לתוצאה יציבה (יש ${assetCount}).`
      : ready ? "פרופיל מוכן לשימוש ביצירה." : "מוכן לניתוח — הרץ ניתוח כדי ללמוד את ה-DNA.";
  return { assetCount, analyzedCount, ready, recommended, stable, status: profile.status, message };
}

export interface ProfileWithHealth { profile: CreativeDnaProfileRow; assets: CreativeReferenceAssetRow[]; health: ProfileHealth }

export async function getProfileDetail(profileId: string): Promise<ProfileWithHealth | null> {
  const profile = await creativeDnaRepository.getProfile(profileId);
  if (!profile) return null;
  const assets = await creativeDnaRepository.listAssets(profileId);
  return { profile, assets, health: computeProfileHealth(profile, assets) };
}

export async function listProfilesWithHealth(): Promise<ProfileWithHealth[]> {
  const profiles = await creativeDnaRepository.listProfiles();
  const out: ProfileWithHealth[] = [];
  for (const p of profiles) {
    const assets = await creativeDnaRepository.listAssets(p.id);
    out.push({ profile: p, assets, health: computeProfileHealth(p, assets) });
  }
  return out;
}

export interface AnalysisResult { ok: boolean; usedVision: boolean; analyzedCount: number; failedCount: number; message: string }

/** Vision-analyze all of a profile's assets, aggregate, persist Style DNA. */
export async function runAnalysis(profileId: string): Promise<AnalysisResult> {
  const profile = await creativeDnaRepository.getProfile(profileId);
  if (!profile) return { ok: false, usedVision: false, analyzedCount: 0, failedCount: 0, message: "profile_not_found" };
  const assets = await creativeDnaRepository.listAssets(profileId);
  if (assets.length === 0) return { ok: false, usedVision: false, analyzedCount: 0, failedCount: 0, message: "אין מודעות ייחוס לנתח." };

  await creativeDnaRepository.updateProfile(profileId, { status: "analyzing" });
  const runId = await creativeDnaRepository.createRun(profileId, assets.length);

  try {
    const { usedVision, perAsset } = await analyzeAssets(assets);
    // Persist per-asset analysis status + extracted signals.
    for (const r of perAsset) {
      const d = r.data ?? {};
      await creativeDnaRepository.updateAssetAnalysis(r.assetId, {
        analysisStatus: r.ok ? "done" : (usedVision ? "error" : "pending"),
        analysisJson: r.data ?? {},
        dominantColors: (d.dominantColors as string[]) ?? (d.colorPalette as string[]) ?? [],
        detectedLayout: (d.detectedLayout as string) ?? (d.compositionType as string) ?? null,
        score: typeof d.stoppingPower === "number" ? (d.stoppingPower as number) : null,
      });
    }
    const analyzedCount = perAsset.filter((r) => r.ok).length;
    const failedCount = perAsset.length - analyzedCount;

    const { dna, usedVision: aggUsedVision } = await aggregateStyleDna(perAsset, profile.name);
    await creativeDnaRepository.applyStyleDna(profileId, dna);
    if (runId) await creativeDnaRepository.completeRun(runId, {
      status: "done", summary: dna.analysisSummary, stylePrompt: dna.stylePrompt,
      outputJson: { ...dna, usedVision: usedVision && aggUsedVision, analyzedCount, failedCount } as unknown as Record<string, unknown>,
    });

    const provider = usedVision && aggUsedVision;
    return {
      ok: true, usedVision: provider, analyzedCount, failedCount,
      message: provider
        ? `נותחו ${analyzedCount} מודעות ונבנה Style DNA.`
        : `נבנה Style DNA בסיסי (ללא ספק Vision — הגדר OPENAI_API_KEY לניתוח מלא). מודעות: ${assets.length}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "analysis_failed";
    await creativeDnaRepository.updateProfile(profileId, { status: "error" });
    if (runId) await creativeDnaRepository.completeRun(runId, { status: "error", error: msg });
    return { ok: false, usedVision: false, analyzedCount: 0, failedCount: assets.length, message: msg };
  }
}

/** Delete an asset row AND its stored object (best-effort storage cleanup). */
export async function deleteAssetWithStorage(assetId: string): Promise<boolean> {
  const asset = await creativeDnaRepository.getAsset(assetId);
  if (!asset) return false;
  try {
    const db = await createClient();
    await db.storage.from(CREATIVE_REFERENCES_BUCKET).remove([asset.storage_path]);
  } catch { /* storage cleanup is best-effort; row deletion is authoritative */ }
  return creativeDnaRepository.deleteAsset(assetId);
}
