import { getOfficeWebsiteForManager, getOfficeWebsiteAnalytics, type OfficeWebsiteConfig, type WebsiteAnalytics } from "@/lib/office-website/service";
import { OfficeWebsiteView } from "./OfficeWebsiteView";

export const dynamic = "force-dynamic";

export default async function OfficeWebsitePage() {
  let config: OfficeWebsiteConfig | null = null;
  let analytics: WebsiteAnalytics | null = null;
  try {
    config = await getOfficeWebsiteForManager();
    if (config) analytics = await getOfficeWebsiteAnalytics();
  } catch (e) {
    console.error("[office-website] load failed:", e);
  }
  return <OfficeWebsiteView config={config} analytics={analytics} />;
}
