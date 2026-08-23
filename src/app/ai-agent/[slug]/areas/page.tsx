// LEGACY ROUTE — RETIRED → canonical `/agent/[slug]`. 308 permanent redirect.
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentAreasRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/agent/${slug}`);
}
