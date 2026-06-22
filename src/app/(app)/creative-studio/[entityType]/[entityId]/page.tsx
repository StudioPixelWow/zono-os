import { getCreativeStudio, type CreativeStudio } from "@/lib/creative-studio/service";
import { listConcepts, type ConceptRow } from "@/lib/creative-studio/concept-service";
import { getSessionContext } from "@/lib/auth/session";
import { CreativeStudioView } from "../../CreativeStudioView";

export const dynamic = "force-dynamic";

export default async function CreativeStudioEntityPage({ params }: { params: Promise<{ entityType: string; entityId: string }> }) {
  const { entityType, entityId } = await params;
  let studio: CreativeStudio | null = null;
  let concepts: ConceptRow[] = [];
  let orgId = ""; let userId = "";
  try {
    const { user, profile } = await getSessionContext();
    orgId = profile?.org_id ?? ""; userId = user?.id ?? "";
    studio = await getCreativeStudio(entityType, entityId);
    concepts = await listConcepts(entityType, entityId);
  } catch (e) { console.error("[creative-studio] load failed:", e); }

  if (!studio) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <h1 className="text-ink text-xl font-black">לא ניתן לטעון את הסטודיו</h1>
        <p className="text-muted mt-2 text-sm">ודא שאתה מחובר ושהישות שייכת לארגון שלך.</p>
      </main>
    );
  }
  return <CreativeStudioView studio={studio} concepts={concepts} orgId={orgId} userId={userId} />;
}
