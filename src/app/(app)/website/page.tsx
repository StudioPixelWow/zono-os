// ============================================================================
// 🌐 ZONO — Website Builder OS page (/website). 38.0.
// Unified builder over the EXISTING website stack (agent/office websites, SEO,
// analytics, branding). Manages sections/templates/SEO/recommendations; publish
// reuses the existing approval-gated flow. No new renderer, no schema.
// ============================================================================
import { getWebsiteBuilder } from "@/lib/website-builder/service";
import { WebsiteBuilder } from "@/components/website-builder/WebsiteBuilder";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const initial = await getWebsiteBuilder("agent");
  return <WebsiteBuilder initial={initial} initialTarget="agent" />;
}
