import { getDistributionConnectionsAction, getFacebookConnectionPathsAction, getMetaIntegrationAction, listFacebookGroupsAction, listGroupTaskStatusesAction } from "@/lib/distribution/provider-connections-actions";
import { CONNECTION_COMPLIANCE, type ProviderConnectionView } from "@/lib/distribution/provider-connections";
import type { FacebookPathView } from "@/lib/distribution/facebook-connection-paths";
import type { MetaIntegrationView } from "@/lib/distribution/meta-pages";
import type { GroupDestination, GroupTaskStatus } from "@/lib/distribution/extension-service";
import { getMetaOAuthConfig } from "@/lib/distribution/meta-oauth";
import { DistributionConnectionsView } from "./DistributionConnectionsView";

export const dynamic = "force-dynamic";

/** Map the OAuth callback's ?meta=… result into an honest Hebrew banner. */
function metaNotice(sp: { meta?: string; reason?: string }): { tone: "ok" | "err"; text: string } | null {
  if (sp.meta === "connected") return { tone: "ok", text: "חשבון Meta חובר בהצלחה. ניתן כעת לסנכרן עמודים." };
  if (sp.meta === "setup_required") return { tone: "err", text: "נדרשת הגדרת Meta בשרת (META_APP_ID / META_APP_SECRET / META_OAUTH_REDIRECT_URI / META_GRAPH_VERSION) לפני חיבור." };
  if (sp.meta === "error") {
    const map: Record<string, string> = {
      state: "אימות אבטחת החיבור נכשל (state/CSRF). התחבר שוב מתוך ZONO.",
      exchange: "החלפת הקוד מול Meta נכשלה. ודא שהאפליקציה מאושרת ונסה שוב.",
      store: "שמירת החיבור נכשלה בצד ZONO. נסה שוב או פנה לתמיכה.",
      encryption: "הצפנת השרת אינה מוגדרת (ZONO_ENCRYPTION_KEY). פנה למנהל המערכת.",
    };
    return { tone: "err", text: (sp.reason && map[sp.reason]) || "החיבור ל-Meta בוטל או נכשל. נסה שוב." };
  }
  return null;
}

// חיבורי הפצה — Facebook Connection Center. Two PARALLEL connection types up top
// (Meta OAuth + Chrome extension), then per-destination provider management.
// Connection MANAGEMENT only — no publishing, no fabricated connected state.
export default async function DistributionConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const notice = metaNotice(sp);
  let connections: ProviderConnectionView[] = [];
  let paths: { meta: FacebookPathView; extension: FacebookPathView } | null = null;
  let metaIntegration: MetaIntegrationView | null = null;
  let groups: GroupDestination[] = [];
  let groupTasks: GroupTaskStatus[] = [];
  try {
    [connections, paths, metaIntegration, groups, groupTasks] = await Promise.all([
      getDistributionConnectionsAction(),
      getFacebookConnectionPathsAction(),
      getMetaIntegrationAction(),
      listFacebookGroupsAction(),
      listGroupTaskStatusesAction(),
    ]);
  } catch (e) {
    console.error("[distribution-connections] load failed:", e);
  }
  const metaConfigured = getMetaOAuthConfig().configured;
  return <DistributionConnectionsView initial={connections} compliance={CONNECTION_COMPLIANCE} paths={paths} metaConfigured={metaConfigured} metaIntegration={metaIntegration} groups={groups} groupTasks={groupTasks} notice={notice} />;
}
