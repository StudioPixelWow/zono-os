// ============================================================================
// ⌘ ZONO — Command Center page (/command-center). Batch 6.4. The universal
// command surface as a full page (the same palette that ⌘K opens everywhere,
// rendered inline). COMPOSITION ONLY over the canonical omnisearch + command
// registry + recents. No business logic, no AI, no new search engine.
// ============================================================================
import { CommandPalette } from "@/components/command-center/CommandPalette";

export const dynamic = "force-dynamic";

export default function CommandCenterPage() {
  return (
    <div dir="rtl" className="mx-auto flex max-w-[720px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">מרכז הפיקוד</h1>
        <p className="text-muted text-[12px]">נקודת הכניסה האחת לכל פעולה ב-ZONO — חיפוש, ניווט, מעבר ופעולות קיימות. פתיחה מכל מקום עם ⌘K / Ctrl+K.</p>
      </header>
      <CommandPalette inline />
    </div>
  );
}
