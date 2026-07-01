// ============================================================================
// 🧠 Research Agent — office-name extractor. Phase 26.4.13.
// ----------------------------------------------------------------------------
// Turns real search snippets into candidate office names. Deterministic first
// (franchise detection — works with NO AI), then AI-assisted extraction from the
// snippets (business-vs-person classification, brand/branch). The AI only reads
// real snippets; it never invents names not present in the results.
// ============================================================================
import type { AIProvider } from "@/lib/ai-reasoning/types";
import { detectFranchise } from "../franchise";
import { isAcceptableOfficeName } from "../office-name-guard";
import { extractionSystem, extractionUser } from "./prompts";
import type { Hit } from "./search";
import type { DiscoveredName, ResearchStage } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Deterministic franchise extraction from a hit (no AI needed). */
function franchiseNames(hits: Hit[], stage: ResearchStage): DiscoveredName[] {
  const out: DiscoveredName[] = [];
  for (const h of hits) {
    const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
    const fr = detectFranchise(text);
    if (fr.matched) out.push({ raw: fr.brandNetwork, stage, url: h.url, snippet: h.snippet, brand: fr.brandNetwork, branch: fr.officeBranchName ?? null, aiConfidence: 55 });
  }
  return out;
}

/** AI extraction over a batch of snippets (best-effort, bounded). */
async function aiNames(provider: AIProvider, city: string, hits: Hit[], stage: ResearchStage): Promise<DiscoveredName[]> {
  const block = hits.slice(0, 14).map((h) => `- ${s(h.title).slice(0, 120)} — ${s(h.snippet).slice(0, 200)} — ${s(h.url).slice(0, 100)}`).join("\n");
  if (!block.trim()) return [];
  let text: string;
  try {
    text = await Promise.race([
      provider.complete({ system: extractionSystem(), user: extractionUser(city, block) }),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
  } catch { return []; }
  let obj: unknown; try { obj = JSON.parse(text); } catch { return []; }
  const arr = (obj as { names?: unknown })?.names;
  if (!Array.isArray(arr)) return [];
  const out: DiscoveredName[] = [];
  for (const item of arr) {
    const o = item as Row;
    const name = s(o.name).trim();
    if (!name || o.isBusiness === false || !isAcceptableOfficeName(name)) continue;
    const conf = Number(o.confidence);
    out.push({ raw: name, stage, url: null, snippet: null, brand: s(o.brand).trim() || null, branch: s(o.branch).trim() || null, aiConfidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : 55 });
  }
  return out;
}

/** Extract discovered office names from a stage's hits (deterministic + AI). */
export async function extractNames(provider: AIProvider | null, city: string, stage: ResearchStage, hits: Hit[]): Promise<DiscoveredName[]> {
  const names = franchiseNames(hits, stage);
  if (provider) names.push(...await aiNames(provider, city, hits, stage));
  return names;
}
