"use client";

// ============================================================================
// ZONO GLOBAL COMMAND CENTER — search-first, action-first, context-aware
// navigation operating system. Opens from the sidebar "ZONO Command" button,
// Cmd/Ctrl+K, or the `zono:command-open` window event. ESC / backdrop / nav
// close it. Premium glass + violet glow, RTL, framer-motion. NOT a CRM menu.
//
// Composition (all driven by the single source of truth `commandRegistry.ts`):
//   Header · CommandSearch · QuickActions · AISuggestions · FavoritesGrid ·
//   RecentItems · SystemMap
//
// Exports preserved for callers: ZonoCommandCenter (DashboardShell mounts it)
// and ZonoCommandButton (Sidebar imports it).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { pushRecentItem } from "@/hooks/useRecentItems";
import type { CommandItem } from "./commandRegistry";
import { CommandSearch } from "./CommandSearch";
import { QuickActions } from "./QuickActions";
import { AISuggestions } from "./AISuggestions";
import { FavoritesGrid } from "./FavoritesGrid";
import { RecentItems } from "./RecentItems";
import { SystemMap } from "./SystemMap";

export function ZonoCommandCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Open via Cmd/Ctrl+K and the sidebar event; close via ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("zono:command-open", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("zono:command-open", onOpen); };
  }, []);

  // Body scroll-lock + autofocus + simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onFocus = (e: FocusEvent) => {
      if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(id);
      document.removeEventListener("focusin", onFocus);
      setQuery("");
    };
  }, [open]);

  const navigate = useCallback((href: string, id: string, label: string, icon?: string, category?: string) => {
    pushRecentItem({ id, label, href, icon, category });
    setOpen(false);
    router.push(href);
  }, [router]);

  const onGo = useCallback((item: CommandItem) => {
    if (item.disabled) return;
    if (item.action && !item.href) { window.dispatchEvent(new Event(item.action)); setOpen(false); return; }
    if (item.href) navigate(item.href, item.id, item.label, item.icon, item.category);
  }, [navigate]);

  const onGoHref = useCallback((href: string, label: string, id?: string, icon?: string) => {
    navigate(href, id ?? href, label, icon);
  }, [navigate]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          dir="rtl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/80"
          style={{ backdropFilter: "blur(22px) saturate(140%)", WebkitBackdropFilter: "blur(22px) saturate(140%)" }}
          role="dialog"
          aria-modal="true"
          aria-label="ZONO Command Center"
        >
          {/* radial violet glow from top center */}
          <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.32),transparent_70%)]" />

          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-9 px-5 py-10 sm:py-14"
          >
            {/* Close (top-left for RTL) */}
            <button type="button" onClick={() => setOpen(false)} aria-label="סגור" className="absolute left-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/15">
              <Icon name="X" size={20} />
            </button>

            {/* Header + search */}
            <header className="flex flex-col items-center gap-4 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_0_40px_rgba(139,92,246,0.55)]"><Icon name="Sparkles" size={24} /></span>
              <div>
                <h1 className="text-3xl font-black text-white sm:text-4xl">לאן תרצה לעבור?</h1>
                <p className="mt-1.5 text-sm font-medium text-white/60">חפש, צור, נתח או נווט בכל מערכת ZONO ממקום אחד</p>
              </div>
              <CommandSearch ref={inputRef} query={query} setQuery={setQuery} onGo={onGo} />
            </header>

            {/* Dashboard surface (hidden while actively searching) */}
            {!query.trim() && (
              <div className="flex flex-col gap-9">
                <QuickActions onGo={onGo} />
                <AISuggestions onGoHref={(href, label) => onGoHref(href, label)} />
                <div className="grid grid-cols-1 gap-9 lg:grid-cols-2">
                  <FavoritesGrid onGo={onGo} />
                  <RecentItems onGoHref={onGoHref} />
                </div>
                <SystemMap onGo={onGo} />

                <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
                  <p className="text-lg font-black text-white sm:text-xl">ZONO — מערכת ההפעלה של הסוכן החזק בזון שלך.</p>
                  <p className="max-w-lg text-sm font-medium text-white/50">נכסים, לקוחות, עסקאות, שיווק, AI ואנליטיקה — בפלטפורמה אחת שעובדת בשבילך.</p>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Sidebar entry button — dispatches the open event. Premium, not a hamburger. */
export function ZonoCommandButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("zono:command-open"))}
      title="ZONO Command · ⌘K"
      aria-label="ZONO Command"
      className="group mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_8px_22px_rgba(139,92,246,0.4)] transition-all hover:scale-[1.03] hover:shadow-[0_12px_30px_rgba(139,92,246,0.6)]"
    >
      <Icon name="Sparkles" size={20} strokeWidth={2.1} />
    </button>
  );
}
