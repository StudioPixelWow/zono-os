// LEGACY ROUTE — RETIRED → canonical `/agent/[slug]` (about is an on-page
// section anchor of the canonical agent site). 308 permanent redirect.
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentAboutRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/agent/${slug}`);
}
