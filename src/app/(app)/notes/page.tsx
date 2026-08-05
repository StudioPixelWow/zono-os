import { listRecentNotes, type NoteDTO } from "@/lib/notes/service";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  let notes: NoteDTO[] = [];
  let failed = false;
  try {
    notes = await listRecentNotes(80);
  } catch (e) {
    console.error("[notes] load failed:", e);
    failed = true;
  }
  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="FilePlus2" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">הערות</h1>
        </div>
        <p className="text-muted text-sm">הערות משותפות לצוות — עם תגיות, נעיצה, ארכוב והיסטוריית עריכה. הערות משויכות לישות מופיעות גם במרחב העבודה שלה.</p>
      </header>
      {failed ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-6 text-center text-sm font-semibold">טעינת ההערות נכשלה — נסה לרענן</div>
      ) : (
        <NotesPanel entity={null} notes={notes} title="הערות אחרונות" />
      )}
    </main>
  );
}
