// ============================================================================
// LEGACY ROUTE — RETIRED. The public agent website is now served from the ONE
// canonical URL `/agent/[slug]` (see docs/prelaunch/AGENT_WEBSITE_CONSOLIDATION).
// This route previously rendered a SECOND, independently-composed public agent
// page — a duplicate-content / keyword-cannibalization hazard. It now issues a
// permanent (308) redirect to the canonical route so every existing link, QR,
// bookmark and stored publicUrl keeps working while Google consolidates ranking
// onto a single indexable agent page.
// ============================================================================
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentHomeRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/agent/${slug}`);
}
