// LEGACY ROUTE — RETIRED → canonical `/agent/[slug]/properties` (308 redirect).
// See ai-agent/[slug]/page.tsx for the consolidation rationale.
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentPropertiesRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/agent/${slug}/properties`);
}
