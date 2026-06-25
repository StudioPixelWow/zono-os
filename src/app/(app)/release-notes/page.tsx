import { Icon } from "@/components/dashboard/Icon";
import { generateReleaseNotes } from "@/lib/launch";

export const dynamic = "force-dynamic";

// Generated deterministically from version metadata (no AI). Newest first.
export default function ReleaseNotesRoute() {
  const notes = generateReleaseNotes();
  return (
    <div dir="rtl" className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line flex items-center gap-3 rounded-[20px] border p-5">
        <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="ScrollText" size={22} /></span>
        <div>
          <h1 className="text-ink text-lg font-black">מה חדש — Release Notes</h1>
          <p className="text-muted text-xs">גרסה נוכחית v{notes[0]?.version}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {notes.map((n) => (
          <div key={n.version} className="bg-card border-line rounded-2xl border p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink font-extrabold">{n.title}</span>
              <span className="flex items-center gap-2">
                <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{n.area}</span>
                <span className="text-brand-strong font-mono text-xs font-bold">v{n.version}</span>
              </span>
            </div>
            <p className="text-muted mb-2 text-[11px]">{new Date(n.date).toLocaleDateString("he-IL")}</p>
            <ul className="flex flex-col gap-1">
              {n.highlights.map((h, i) => (
                <li key={i} className="text-ink flex items-start gap-1.5 text-sm"><Icon name="Check" size={14} className="text-emerald-400 mt-0.5 shrink-0" /> {h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
