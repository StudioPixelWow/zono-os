// ============================================================================
// 📘 C9 COMPAT — Evolution CAPABILITY / version detection (server-only).
// ----------------------------------------------------------------------------
// Best-effort feature detection with safe fallbacks. If Evolution's root reports
// a version, we record it; otherwise we assume the configured target version.
// The adapter asks "can I send media / presence?" and gets a stable boolean —
// it never branches on an Evolution version string itself.
// ============================================================================
import "server-only";
import type { EvolutionConfig } from "./config";
import { evoFetch } from "./client";

export interface Capabilities {
  detectedVersion: string | null;
  supportsMedia: boolean;
  supportsPresence: boolean;
}

interface RawRoot { version?: string; message?: string }

/** Detect capabilities from the Evolution root. Never throws; falls back to the
 *  configured target version with the full v2 feature set enabled. */
export async function detectCapabilities(cfg: EvolutionConfig): Promise<Capabilities> {
  const res = await evoFetch<RawRoot>(cfg, "GET", "/");
  const detectedVersion = res.ok ? (res.data.version ?? null) : null;
  const major = (detectedVersion ?? cfg.targetVersion).split(".")[0];
  // v2 supports both; the switch is the seam for a future version that doesn't.
  const supportsMedia = major >= "2";
  const supportsPresence = major >= "2";
  return { detectedVersion, supportsMedia, supportsPresence };
}
