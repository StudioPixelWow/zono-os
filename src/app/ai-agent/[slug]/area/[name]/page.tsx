// LEGACY ROUTE — RETIRED → canonical `/agent/[slug]`. 308 permanent redirect.
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentAreaRedirect({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/agent/${slug}`);
}
