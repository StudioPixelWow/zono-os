import { getAuthUser } from "@/lib/auth/session";
import { OnboardingWizard } from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getAuthUser();
  const meta = (user?.user_metadata ?? {}) as { full_name?: string };

  return (
    <OnboardingWizard
      email={user?.email ?? ""}
      defaultFullName={meta.full_name ?? ""}
    />
  );
}
