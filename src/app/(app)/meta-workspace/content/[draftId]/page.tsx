// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · Draft editor. Phase 2 UI (RTL).
// Shows the draft, targets, validation/preview panels + version/approval state.
// The Publish control is a DISABLED placeholder, clearly labeled as a later phase.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { getDraftEditor } from "@/lib/meta/content/service";

export const dynamic = "force-dynamic";

export default async function DraftEditorPage({ params }: { params: Promise<{ draftId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const { draftId } = await params;
  const draft = await getDraftEditor(sc.profile.org_id, draftId);
  if (!draft) return <main dir="rtl" className="p-8 text-center text-gray-600">הטיוטה לא נמצאה.</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/meta-workspace/content" className="text-sm text-blue-600">→ חזרה לרשימה</Link>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{draft.status} · v{draft.currentVersion}</span>
      </div>
      <h1 className="mb-1 text-2xl font-bold">{draft.internalName}</h1>
      <p className="mb-6 text-sm text-gray-500">מצב אישור: {draft.approvalState}</p>

      <section className="mb-6 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">תוכן משותף</h2>
        <p className="whitespace-pre-wrap text-gray-800">{draft.defaultCaption || <span className="text-gray-400">אין כיתוב עדיין</span>}</p>
        {draft.defaultHashtags.length > 0 && <p className="mt-2 text-sm text-blue-600">{draft.defaultHashtags.map((h) => `#${h}`).join(" ")}</p>}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">יעדים ({draft.targets.length})</h2>
        {draft.targets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">לא נבחרו יעדים. הוסיפו עמוד פייסבוק או חשבון אינסטגרם.</p>
        ) : (
          <ul className="space-y-2">
            {draft.targets.map((t) => (
              <li key={t.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.platform === "facebook" ? "פייסבוק" : "אינסטגרם"} · {t.contentKind}</span>
                  <span className={t.enabled ? "text-green-600" : "text-gray-400"}>{t.enabled ? "פעיל" : "כבוי"}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{t.caption || "(יורש מהתוכן המשותף)"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">שמור</button>
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">בקשת אישור</button>
        {/* Publish is intentionally disabled in Phase 2 — arrives in the publishing phase. */}
        <button disabled title="פרסום יתווסף בשלב הפרסום" className="ml-auto cursor-not-allowed rounded-lg border border-gray-200 px-4 py-2 text-gray-400" aria-disabled="true">פרסום (בקרוב — שלב הפרסום)</button>
      </div>
    </main>
  );
}
