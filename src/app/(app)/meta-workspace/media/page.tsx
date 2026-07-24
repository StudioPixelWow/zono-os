// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Media Library. Phase 2 UI (RTL).
// Shows org media (short-lived signed URLs; no permanent private paths).
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { listMedia } from "@/lib/meta/media/service";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const media = await listMedia(sc.profile.org_id);

  return (
    <main dir="rtl" className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold">ספריית מדיה</h1>
      <p className="mb-6 text-sm text-gray-500">תמונות וסרטונים לשימוש בטיוטות</p>
      {media.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">אין עדיין מדיה. העלו תמונה או סרטון.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {media.map((m) => (
            <figure key={m.id} className="overflow-hidden rounded-lg border border-gray-200">
              <div className="flex aspect-square items-center justify-center bg-gray-50 text-gray-400">
                {m.kind === "image" && m.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.previewUrl} alt={m.displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm">{m.kind === "video" ? "🎬 וידאו" : "תמונה"}</span>
                )}
              </div>
              <figcaption className="truncate p-2 text-xs text-gray-600" title={m.displayName}>{m.displayName}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </main>
  );
}
