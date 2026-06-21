import { getAgentWebsiteForAgent, getAgentWebsiteAnalytics, type AgentWebsiteConfig, type AgentWebsiteAnalytics } from "@/lib/agent-website/service";
import { AgentWebsiteView } from "./AgentWebsiteView";

export const dynamic = "force-dynamic";

export default async function AgentWebsitePage() {
  let config: AgentWebsiteConfig | null = null;
  let analytics: AgentWebsiteAnalytics | null = null;
  try {
    config = await getAgentWebsiteForAgent();
    if (config) analytics = await getAgentWebsiteAnalytics();
  } catch (e) {
    console.error("[agent-website] load failed:", e);
  }
  return <AgentWebsiteView config={config} analytics={analytics} />;
}
