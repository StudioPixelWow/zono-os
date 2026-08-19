// ============================================================================
// ZONO — shared operating-surface tabs: היום שלי | המשרד | תובנות. ONE compact
// pill that ties the personal day (/today/plan), the office exceptions center
// (/office) and office intelligence (/office/intelligence) into a single operating
// system instead of three separately-built screens. PURE presentation — no data
// fetching, no business logic. Role gating is passed in via `isManager` (already
// resolved server-side); agents only ever see "היום שלי" and the office tabs are
// simply not rendered for them (server routes still enforce access). Inherits RTL
// from the page. Active tab renders as a static span; the rest are links.
// ============================================================================
import Link from "next/link";

type Surface = "today" | "office" | "intelligence";

const TABS: { key: Surface; label: string; href: string; managerOnly: boolean }[] = [
  { key: "today", label: "היום שלי", href: "/today/plan", managerOnly: false },
  { key: "office", label: "המשרד", href: "/office", managerOnly: true },
  { key: "intelligence", label: "תובנות", href: "/office/intelligence", managerOnly: true },
];

/** Compact shared navigation between the three operating surfaces. */
export function SurfaceTabs({ active, isManager }: { active: Surface; isManager: boolean }) {
  const tabs = TABS.filter((t) => !t.managerOnly || isManager);
  // Nothing to switch between (agent with a single surface) → render no chrome.
  if (tabs.length < 2) return null;

  return (
    <nav className="border-line flex w-fit items-center gap-1 self-start rounded-2xl border p-1 text-sm font-bold">
      {tabs.map((t) =>
        t.key === active ? (
          <span key={t.key} aria-current="page" className="bg-brand rounded-xl px-4 py-2 text-white">{t.label}</span>
        ) : (
          <Link key={t.key} href={t.href} className="text-muted rounded-xl px-4 py-2 hover:bg-surface">{t.label}</Link>
        ),
      )}
    </nav>
  );
}
