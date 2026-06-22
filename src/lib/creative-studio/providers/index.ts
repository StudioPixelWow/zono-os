// ============================================================================
// ZONO — Creative Studio · provider selection (server-side)
// ----------------------------------------------------------------------------
// Chooses the active provider from env. Defaults to mock when no key exists,
// so the flow always works and never crashes. Keys stay server-side.
// ============================================================================
import type { MarketingDnaProvider } from "./types";
import { mockProvider } from "./mock";
import { makeGeminiProvider } from "./gemini";
import { makeOpenAiProvider } from "./openai";

export function selectMarketingDnaProvider(): MarketingDnaProvider {
  const choice = (process.env.ZONO_MARKETING_ANALYSIS_PROVIDER || "").toLowerCase();
  const gemini = process.env.GEMINI_API_KEY;
  const openai = process.env.OPENAI_API_KEY;

  if (choice === "gemini" && gemini) return makeGeminiProvider(gemini);
  if (choice === "openai" && openai) return makeOpenAiProvider(openai);
  if (choice === "mock") return mockProvider;
  // auto-detect when no explicit (valid) choice: prefer gemini, then openai, else mock
  if (gemini) return makeGeminiProvider(gemini);
  if (openai) return makeOpenAiProvider(openai);
  return mockProvider;
}

export { mockProvider };
export type { MarketingDnaProvider, MarketingDnaResult, AnalysisInput, AnalysisAsset } from "./types";
