// ============================================================================
// 👤 ZONO — Agent Personal Area (/my-profile). Reads the unified profile model
// (the existing agent_websites row + user identity + office logo + completion)
// and renders the profile studio. Single source of truth for the Agent Website.
// ============================================================================
import { getMyProfile } from "@/lib/my-profile/service";
import { MyProfileView } from "./MyProfileView";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const profile = await getMyProfile();
  return <MyProfileView profile={profile} />;
}
