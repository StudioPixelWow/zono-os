"use server";
// ============================================================================
// ZONO — Creative DNA server actions. Thin, org-scoped wrappers over the
// repository + service. Every write goes to Supabase (RLS-enforced); reads are
// org-scoped. The client uploads reference files to storage (upload.ts), then
// calls addCreativeReferenceAssetAction with the resulting storage path.
// ============================================================================
import { revalidatePath } from "next/cache";
import { creativeDnaRepository } from "./repository";
import {
  getProfileDetail, listProfilesWithHealth, runAnalysis, deleteAssetWithStorage,
  type ProfileWithHealth, type AnalysisResult,
} from "./service";
import { DEFAULT_DNA_PRESETS } from "./prompts";
import { MAX_REFERENCES_PER_PROFILE, type CreativeDnaProfileRow, type CreativeReferenceAssetRow } from "./types";

export interface ActionResult<T = undefined> { ok: boolean; message?: string; data?: T }

const revalidate = () => { try { revalidatePath("/creative-dna"); } catch { /* noop outside request */ } };

// ── Reads ─────────────────────────────────────────────────────────────────────
export async function listCreativeDNAProfilesAction(): Promise<ProfileWithHealth[]> {
  return listProfilesWithHealth();
}
export async function getCreativeDNAProfileAction(profileId: string): Promise<ProfileWithHealth | null> {
  return getProfileDetail(profileId);
}
export async function listCreativeReferenceAssetsAction(profileId: string): Promise<CreativeReferenceAssetRow[]> {
  return creativeDnaRepository.listAssets(profileId);
}
/** Code presets exposed to the generation selector (id stays null). */
export async function listCreativeDNAPresetsAction(): Promise<{ presetKey: string; name: string; description: string }[]> {
  return DEFAULT_DNA_PRESETS.map((p) => ({ presetKey: p.presetKey, name: p.name, description: p.description }));
}

// ── Profile mutations ───────────────────────────────────────────────────────────
export async function createCreativeDNAProfileAction(input: { name: string; description?: string; styleType?: string }): Promise<ActionResult<CreativeDnaProfileRow>> {
  const name = input.name?.trim();
  if (!name) return { ok: false, message: "נדרש שם לפרופיל." };
  const row = await creativeDnaRepository.createProfile({ name, description: input.description?.trim() || null, styleType: input.styleType });
  if (!row) return { ok: false, message: "יצירת הפרופיל נכשלה (הרשאות/חיבור)." };
  revalidate();
  return { ok: true, data: row };
}
export async function updateCreativeDNAProfileAction(profileId: string, patch: { name?: string; description?: string }): Promise<ActionResult> {
  const clean: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) clean.name = patch.name.trim();
  if (patch.description !== undefined) clean.description = patch.description.trim() || null;
  const ok = await creativeDnaRepository.updateProfile(profileId, clean);
  revalidate();
  return { ok, message: ok ? undefined : "העדכון נכשל." };
}
export async function deleteCreativeDNAProfileAction(profileId: string): Promise<ActionResult> {
  const ok = await creativeDnaRepository.deleteProfile(profileId);
  revalidate();
  return { ok, message: ok ? undefined : "המחיקה נכשלה." };
}
export async function setDefaultCreativeDNAProfileAction(profileId: string): Promise<ActionResult> {
  const ok = await creativeDnaRepository.setDefault(profileId);
  revalidate();
  return { ok, message: ok ? undefined : "הגדרת ברירת המחדל נכשלה." };
}

// ── Reference assets ─────────────────────────────────────────────────────────────
export async function addCreativeReferenceAssetAction(input: { profileId: string; storagePath: string; fileName?: string | null; mimeType?: string | null }): Promise<ActionResult<CreativeReferenceAssetRow>> {
  if (!input.profileId || !input.storagePath) return { ok: false, message: "נתוני נכס חסרים." };
  const count = await creativeDnaRepository.countAssets(input.profileId);
  if (count >= MAX_REFERENCES_PER_PROFILE) return { ok: false, message: `הגעת למקסימום (${MAX_REFERENCES_PER_PROFILE}) מודעות ייחוס.` };
  const row = await creativeDnaRepository.insertAsset({
    profileId: input.profileId, storagePath: input.storagePath,
    fileName: input.fileName ?? null, mimeType: input.mimeType ?? null,
  });
  if (!row) return { ok: false, message: "הוספת המודעה נכשלה." };
  revalidate();
  return { ok: true, data: row };
}
export async function deleteCreativeReferenceAssetAction(assetId: string): Promise<ActionResult> {
  const ok = await deleteAssetWithStorage(assetId);
  revalidate();
  return { ok, message: ok ? undefined : "מחיקת המודעה נכשלה." };
}

// ── Analysis ─────────────────────────────────────────────────────────────────────
export async function analyzeCreativeDNAProfileAction(profileId: string): Promise<AnalysisResult> {
  const res = await runAnalysis(profileId);
  revalidate();
  return res;
}
/** Reanalyze == run analysis again (overwrites the Style DNA from current assets). */
export async function reanalyzeCreativeDNAProfileAction(profileId: string): Promise<AnalysisResult> {
  return analyzeCreativeDNAProfileAction(profileId);
}
