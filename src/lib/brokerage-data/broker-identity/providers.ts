// ============================================================================
// 🌐 Public knowledge providers (Phase 26.12, STEP 2). Provider ABSTRACTION with
// a strict structured contract. Each provider must return
// { provider, url, office_name, confidence, reason, observed_text } — never
// fabricated. None are wired to a live source yet, so each reports
// enabled=false / skippedReason="not_configured" and contributes no evidence.
// Wiring a real provider later means implementing gather() behind its env flag;
// nothing downstream changes. Server-safe (reads env only).
// ============================================================================
import "server-only";
import type { BrokerIdentityPackage, EvidenceSource, IdentityEvidence, ProviderResult } from "./types";

export interface PublicBrokerProvider {
  id: EvidenceSource;
  label: string;
  /** Configured + allowed to run (gated behind an explicit env flag). */
  isEnabled(): boolean;
  /** Returns structured evidence ONLY. Must never invent office/phone/site. */
  gather(pkg: BrokerIdentityPackage): Promise<IdentityEvidence[]>;
}

// Each provider is gated behind its own env flag AND the global enable switch.
const ON = () => !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;
function stub(id: EvidenceSource, label: string, flag: string): PublicBrokerProvider {
  return {
    id, label,
    isEnabled: () => ON() && !!process.env[flag],
    async gather() { return []; },   // no live source configured — never fabricate
  };
}

export const PUBLIC_PROVIDERS: PublicBrokerProvider[] = [
  stub("google_business", "Google Business", "ZONO_GOOGLE_BUSINESS_KEY"),
  stub("google_maps", "Google Maps", "ZONO_GOOGLE_MAPS_KEY"),
  stub("facebook", "Facebook", "ZONO_FACEBOOK_KEY"),
  stub("linkedin", "LinkedIn", "ZONO_LINKEDIN_KEY"),
  stub("yad2", "Yad2", "ZONO_YAD2_KEY"),
  stub("madlan", "Madlan", "ZONO_MADLAN_KEY"),
  stub("official_website", "Official website", "ZONO_WEB_DISCOVERY_KEY"),
];

/** Run every public provider; collect structured evidence + per-provider status. */
export async function gatherPublicBrokerEvidence(pkg: BrokerIdentityPackage): Promise<{ evidence: IdentityEvidence[]; providers: ProviderResult[] }> {
  const evidence: IdentityEvidence[] = [];
  const providers: ProviderResult[] = [];
  for (const p of PUBLIC_PROVIDERS) {
    const enabled = p.isEnabled();
    if (!enabled) { providers.push({ provider: p.id, enabled: false, skippedReason: "not_configured", evidence: [] }); continue; }
    try {
      const ev = await p.gather(pkg);
      evidence.push(...ev);
      providers.push({ provider: p.id, enabled: true, skippedReason: null, evidence: ev });
    } catch (e) {
      providers.push({ provider: p.id, enabled: true, skippedReason: e instanceof Error ? e.message : "provider_error", evidence: [] });
    }
  }
  return { evidence, providers };
}
