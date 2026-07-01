// ============================================================================
// 🧠 Research Agent — AI prompts (pure). Phase 26.4.13.
// The AI EXTRACTS/CLASSIFIES/DEDUPES from real search snippets — it never
// invents offices, phones, or sources. All prompts demand STRICT JSON.
// ============================================================================

/** Extract office names from a batch of real search snippets. */
export function extractionSystem(): string {
  return [
    "You extract REAL-ESTATE BROKERAGE OFFICE names from Israeli web-search snippets.",
    "Rules: return business/office names ONLY — never individual agents/people, never neighborhoods, never generic phrases.",
    "Classify each as a business office (isBusiness=true) or a person/other (isBusiness=false).",
    "Identify brand/network (e.g. RE/MAX, Anglo-Saxon, Century 21, Keller Williams) and branch when visible.",
    "Do NOT invent names not supported by the snippets. Return STRICT JSON only:",
    "{\"names\":[{\"name\":string,\"brand\":string|null,\"branch\":string|null,\"isBusiness\":boolean,\"confidence\":number}]}",
  ].join(" ");
}
export function extractionUser(city: string, snippets: string): string {
  return `City: ${city}, Israel.\nExtract brokerage office names from these search results (title — snippet — url):\n${snippets}\nReturn JSON only.`;
}

/** Ask the AI to PROPOSE candidate office names for the city (enrichment only). */
export function proposeSystem(): string {
  return [
    "You PROPOSE candidate names of active real-estate brokerage OFFICES in an Israeli city.",
    "You are NOT a source of truth — a web search will verify each name.",
    "Return business/office names only (never agents). Include franchise branches and local independents.",
    "Return STRICT JSON only: {\"names\":[{\"name\":string,\"brand\":string|null,\"branch\":string|null,\"confidence\":number}]}. Aim for up to 40.",
  ].join(" ");
}
export function proposeUser(city: string): string {
  return `List up to 40 active real estate brokerage offices operating in ${city}, Israel. Include franchise branches and local independent offices. Return business/office names only. Return JSON only.`;
}
