import { listCreativeDNAProfilesAction, listCreativeDNAPresetsAction } from "@/lib/creative-dna/actions";
import type { ProfileWithHealth } from "@/lib/creative-dna/service";
import { getSessionContext } from "@/lib/auth/session";
import { CreativeDnaView } from "./CreativeDnaView";

export const dynamic = "force-dynamic";

export default async function CreativeDnaPage() {
  let profiles: ProfileWithHealth[] = [];
  let presets: { presetKey: string; name: string; description: string }[] = [];
  let orgId = "";

  try {
    const { profile } = await getSessionContext();
    orgId = profile?.org_id ?? "";
  } catch (e) {
    console.error("[creative-dna] session load failed:", e);
  }
  try {
    profiles = await listCreativeDNAProfilesAction();
  } catch (e) {
    console.error("[creative-dna] profiles load failed:", e);
  }
  try {
    presets = await listCreativeDNAPresetsAction();
  } catch (e) {
    console.error("[creative-dna] presets load failed:", e);
  }

  return <CreativeDnaView profiles={profiles} presets={presets} orgId={orgId} />;
}
