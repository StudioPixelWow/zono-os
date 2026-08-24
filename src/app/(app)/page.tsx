// ============================================================================
// ☀️ ZONO — היום שלי (MY DAY) — the DEFAULT Home. "מה אני צריך לעשות עכשיו?".
// A zero-scroll daily cockpit (DO), distinct from מרכז הבקרה (UNDERSTAND, at
// /control-center) and the CRM/property/calendar modules (MANAGE). Composition
// only — every section is fed by the shared getMyDayCockpit() aggregation, which
// REUSES the existing engines (broker-intelligence queue, agent daily plan, deals/
// buyers/leads boards). No new engines, no schema, nothing mocked. A brand-new
// office still gets the personalized activation command center (WOW branch).
// ============================================================================
import { after } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runOrchestratorForSession } from "@/lib/orchestrator";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { getCityDiscovery } from "@/lib/activation/city-discovery-server";
import { buildOfficeTheme, OFFICE_THEME_DEFAULTS } from "@/lib/brand-identity/office-theme";
import { NewOfficeCommandCenter } from "@/components/home-control/NewOfficeCommandCenter";
import { OnboardingNextStep } from "@/components/onboarding/OnboardingNextStep";
import { getMyDayCockpit } from "@/lib/my-day/service";
import { MyDayCockpit } from "@/components/my-day/MyDayCockpit";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";
import { HomeQuickActions } from "@/components/home-control/HomeQuickActions";

export const dynamic = "force-dynamic";

export default async function Home() {
  // ── FIRST-LOGIN WOW — a brand-new office (no operational data yet) gets the
  // personalized activation command center instead of an empty cockpit. Best-effort:
  // any failure degrades to the normal cockpit. (Same behavior as the prior Home.)
  // Props are RESOLVED inside the try; the JSX is returned outside it.
  let newOffice: React.ComponentProps<typeof NewOfficeCommandCenter> | null = null;
  try {
    const act = await getOfficeActivation();
    if (act && act.activation.phase === "new") {
      const theme = buildOfficeTheme(act.brand.primary, act.brand.secondary, act.brand.accent);
      const discovery = await getCityDiscovery(act.identity.orgId, act.identity.city, act.identity.localityCode);
      after(async () => {
        try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
        catch { /* best-effort */ }
      });
      newOffice = {
        identity: act.identity, activation: act.activation, trial: act.trial,
        discovery, themeVars: { ...OFFICE_THEME_DEFAULTS, ...theme.vars }, hasBrand: theme.hasBrand,
      };
    }
  } catch (e) {
    console.error("[my-day] activation resolve failed — falling back to cockpit:", e);
  }
  if (newOffice) return <NewOfficeCommandCenter {...newOffice} />;

  // Background intelligence refresh (existing behavior; never blocks render).
  const { profile } = await getSessionContext();
  if (profile) {
    after(async () => {
      try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
      catch { /* best-effort */ }
    });
  }

  const data = await getMyDayCockpit();
  return (
    <>
      <OnboardingNextStep />
      <MyDayCockpit data={data} />
      {/* Quick-actions row — a big-button separator between the cockpit and the map.
          Every tile links to a real create/act surface (no dead buttons). */}
      <div className="mt-3">
        <HomeQuickActions columns={6} />
      </div>
      {/* Live property heat-map — REAL internal + external listings in the agent's
          operating area. Placed below the cockpit (the cockpit is a fixed-height
          zero-scroll panel on xl, so this appears on scroll, right below it). */}
      <div className="mt-3">
        <HomeHeatmapSection />
      </div>
    </>
  );
}
