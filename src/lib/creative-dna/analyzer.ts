// ============================================================================
// ZONO — Creative DNA analyzer (server-only). REAL AI Vision over the uploaded
// reference ads: per-asset style extraction (gpt-4o-mini vision) → aggregation
// into ONE Style DNA. When OPENAI_API_KEY is absent it degrades to a deterministic
// fallback built from whatever per-asset signals exist (never fabricated).
// Never logs signed URLs or the API key.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CREATIVE_REFERENCES_BUCKET, type StyleDNA, type CreativeReferenceAssetRow } from "./types";
import { ASSET_VISION_PROMPT, buildAggregationPrompt, fallbackStyleDna } from "./prompts";

const VISION_MODEL = process.env.ZONO_OPENAI_MODEL || "gpt-4o-mini";
const VISION_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function parseJsonLoose(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return {};
}

async function signedUrl(path: string): Promise<string | null> {
  const db = await createClient();
  const { data } = await db.storage.from(CREATIVE_REFERENCES_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** Vision-analyze ONE reference asset → style JSON (or null on failure). */
async function analyzeOneAsset(asset: CreativeReferenceAssetRow, apiKey: string): Promise<Record<string, unknown> | null> {
  if (asset.mime_type && !VISION_MIME.includes(asset.mime_type)) return null;
  const url = await signedUrl(asset.storage_path);
  if (!url) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL, temperature: 0.3, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: ASSET_VISION_PROMPT }, { type: "image_url", image_url: { url } }] }],
    }),
  });
  if (!res.ok) throw new Error(`Vision request failed (${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) return null;
  return parseJsonLoose(text);
}

export interface AssetAnalysis { assetId: string; ok: boolean; data: Record<string, unknown> | null; error?: string }

/** Analyze every asset; returns per-asset results (Vision when keyed). */
export async function analyzeAssets(assets: CreativeReferenceAssetRow[]): Promise<{ usedVision: boolean; perAsset: AssetAnalysis[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { usedVision: false, perAsset: assets.map((a) => ({ assetId: a.id, ok: false, data: null, error: "no_vision_provider" })) };
  }
  const perAsset: AssetAnalysis[] = [];
  for (const a of assets) {
    try {
      const data = await analyzeOneAsset(a, apiKey);
      perAsset.push({ assetId: a.id, ok: !!data, data });
    } catch (e) {
      perAsset.push({ assetId: a.id, ok: false, data: null, error: e instanceof Error ? e.message : "vision_failed" });
    }
  }
  return { usedVision: true, perAsset };
}

/** Aggregate per-asset analyses into ONE Style DNA (Vision aggregation or fallback). */
export async function aggregateStyleDna(
  perAsset: AssetAnalysis[], profileName: string,
): Promise<{ dna: StyleDNA; usedVision: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const good = perAsset.filter((p) => p.ok && p.data).map((p) => p.data as Record<string, unknown>);

  if (!apiKey || good.length === 0) {
    const signals = good.map((d) => ({
      dominantColors: (d.dominantColors as string[]) ?? (d.colorPalette as string[]) ?? [],
      luxuryLevel: d.luxuryLevel as string | undefined, densityLevel: d.densityLevel as string | undefined,
    }));
    return { dna: fallbackStyleDna(signals, profileName), usedVision: false };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: VISION_MODEL, temperature: 0.4, response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildAggregationPrompt(good, profileName) }],
      }),
    });
    if (!res.ok) throw new Error(`Aggregation failed (${res.status})`);
    const json = await res.json();
    const parsed = parseJsonLoose(json?.choices?.[0]?.message?.content ?? "");
    const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
    const dna: StyleDNA = {
      analysisSummary: String(parsed.analysisSummary ?? "").slice(0, 1200) || `סגנון שאוחד מ-${good.length} מודעות.`,
      stylePrompt: String(parsed.stylePrompt ?? "").slice(0, 2000),
      negativePrompt: String(parsed.negativePrompt ?? "").slice(0, 800),
      colorPalette: Array.isArray(parsed.colorPalette) ? (parsed.colorPalette as string[]).slice(0, 8).map(String) : [],
      typographyRules: asObj(parsed.typographyRules), layoutRules: asObj(parsed.layoutRules),
      hierarchyRules: asObj(parsed.hierarchyRules), iconRules: asObj(parsed.iconRules),
      agentPositioningRules: asObj(parsed.agentPositioningRules), logoRules: asObj(parsed.logoRules),
      imageUsageRules: asObj(parsed.imageUsageRules),
    };
    if (!dna.stylePrompt) {
      const signals = good.map((d) => ({ dominantColors: (d.dominantColors as string[]) ?? [], luxuryLevel: d.luxuryLevel as string | undefined, densityLevel: d.densityLevel as string | undefined }));
      return { dna: fallbackStyleDna(signals, profileName), usedVision: false };
    }
    return { dna, usedVision: true };
  } catch {
    const signals = good.map((d) => ({ dominantColors: (d.dominantColors as string[]) ?? [], luxuryLevel: d.luxuryLevel as string | undefined, densityLevel: d.densityLevel as string | undefined }));
    return { dna: fallbackStyleDna(signals, profileName), usedVision: false };
  }
}
