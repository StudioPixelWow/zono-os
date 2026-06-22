import { getBrandStudio, type BrandStudio } from "@/lib/brand-identity/service";
import { getSessionContext } from "@/lib/auth/session";
import { BrandIdentityView } from "./BrandIdentityView";

export const dynamic = "force-dynamic";

export default async function BrandIdentityPage() {
  let studio: BrandStudio | null = null;
  let orgId = ""; let userId = "";
  try {
    const { user, profile } = await getSessionContext();
    orgId = profile?.org_id ?? ""; userId = user?.id ?? "";
    studio = await getBrandStudio("agent", userId);
  } catch (e) { console.error("[brand] load failed:", e); }

  if (!studio) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <h1 className="text-ink text-xl font-black">לא ניתן לטעון את פרופיל המותג</h1>
        <p className="text-muted mt-2 text-sm">ודא שאתה מחובר.</p>
      </main>
    );
  }
  return <BrandIdentityView studio={studio} orgId={orgId} userId={userId} />;
}
