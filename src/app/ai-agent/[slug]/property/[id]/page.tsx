// LEGACY ROUTE — RETIRED → canonical property microsite `/p/[id]` (the ONE
// canonical property URL). 308 permanent redirect.
import { permanentRedirect } from "next/navigation";

export default async function LegacyAgentPropertyRedirect({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/p/${id}`);
}
