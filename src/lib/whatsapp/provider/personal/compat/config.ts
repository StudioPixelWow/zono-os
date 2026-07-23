// ============================================================================
// 📘 C9 COMPAT — Evolution connection CONFIG (server-only).
// ----------------------------------------------------------------------------
// The ONE place that reads Evolution's environment (base URL + API key + the
// pinned target version). Nothing outside src/lib/whatsapp/provider/personal/
// may read these vars. The adapter asks this module "are we configured?" and
// gets a neutral answer; it never touches Evolution env names itself.
// ============================================================================
import "server-only";

export interface EvolutionConfig {
  /** Base URL of the self-hosted Evolution deployment (no trailing slash). */
  baseUrl: string;
  /** Evolution admin/API key sent as the `apikey` header. */
  apiKey: string;
  /** The Evolution major version this compat layer targets (capability gate). */
  targetVersion: string;
}

/** Read + normalize Evolution config. Returns null when not configured (honest
 *  "unavailable" — never a fabricated connection). Never throws. */
export function evolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim();
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  const targetVersion = process.env.EVOLUTION_API_VERSION?.trim() || "2";
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, targetVersion };
}

/** True when Evolution is configured for this deployment. */
export function isEvolutionConfigured(): boolean {
  return evolutionConfig() !== null;
}
