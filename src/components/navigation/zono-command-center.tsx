"use client";

// ============================================================================
// ZONO COMMAND CENTER — full-screen navigation operating-system overlay.
// Opens from the sidebar "ZONO Command" button, Cmd/Ctrl+K, or the
// `zono:command-open` window event. ESC / backdrop / link-click close it.
// Premium glass + purple-gradient, RTL, framer-motion fade/blur. Not a menu.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

interface QuickLink { label: string; href: string }
interface Section {
  key: string;
  emoji: string;
  icon: string;
  title: string;
  desc: string;
  stats: { label: string; value: string; tone?: "danger" | "success" | "brand" }[];
  links: QuickLink[];
  highlight?: boolean;
}

const SECTIONS: Section[] = [
  {
    key: "properties", emoji: "🏠", icon: "Building2", title: "נכסים", desc: "ניהול כלל הנכסים במערכת",
    stats: [],
    links: [
      { label: "נכסים", href: "/properties" },
      { label: "גיוס נכסים", href: "/acquisition" },
      { label: "נכסים חמים", href: "/" },
      { label: "מפת הזדמנויות", href: "/market" },
    ],
  },
  {
    key: "clients", emoji: "👥", icon: "Users", title: "לקוחות", desc: "ניהול קונים ומוכרים",
    stats: [],
    links: [
      { label: "קונים", href: "/buyers" },
      { label: "מוכרים", href: "/sellers" },
      { label: "לידים", href: "/social-leads" },
      { label: "התאמות", href: "/matches" },
    ],
  },
  {
    key: "deals", emoji: "💰", icon: "Handshake", title: "עסקאות", desc: "מעקב אחר תהליכי מכירה",
    stats: [],
    links: [
      { label: "עסקאות", href: "/deals" },
      { label: "משימות", href: "/command" },
      { label: "יומן", href: "/command" },
      { label: "פעילות", href: "/command" },
    ],
  },
  {
    key: "ai", emoji: "✨", icon: "Sparkles", title: "AI Center", desc: "מרכז הבינה של ZONO", highlight: true,
    stats: [],
    links: [
      { label: "AI Command Center", href: "/command" },
      { label: "AI Insights", href: "/ai-office" },
      { label: "Opportunity Radar", href: "/command" },
      { label: "Market Intelligence", href: "/market" },
    ],
  },
  {
    key: "marketing", emoji: "📣", icon: "Megaphone", title: "שיווק", desc: "ניהול פרסום ותקשורת",
    stats: [],
    links: [
      { label: "WhatsApp", href: "/whatsapp" },
      { label: "Facebook Groups", href: "/distribution" },
      { label: "קמפיינים", href: "/creative-studio" },
      { label: "אתרי לקוח", href: "/portals" },
    ],
  },
  {
    key: "system", emoji: "⚙️", icon: "Settings", title: "מערכת", desc: "ניהול וכלי מערכת",
    stats: [],
    links: [
      { label: "CRM", href: "/buyers" },
      { label: "הגדרות", href: "/settings" },
      { label: "משתמשים", href: "/team" },
      { label: "הרשאות", href: "/admin/permissions" },
      { label: "אינטגרציות", href: "/settings" },
    ],
  },
];

const QUICK_ACTIONS: { label: string; icon: string; href: string }[] = [
  { label: "נכס חדש", icon: "Building2", href: "/properties/new" },
  { label: "קונה חדש", icon: "Users", href: "/buyers/new" },
  { label: "מוכר חדש", icon: "UserCheck", href: "/sellers/new" },
  { label: "משימה חדשה", icon: "ListChecks", href: "/command" },
  { label: "פגישה חדשה", icon: "Calendar", href: "/command" },
  { label: "עסקה חדשה", icon: "Handshake", href: "/deals" },
  { label: "קמפיין חדש", icon: "Sparkles", href: "/creative-studio" },
];

/** Flat search index over every navigable destination. */
const SEARCH_INDEX: { label: string; href: string; section: string; icon: string }[] = SECTIONS.flatMap((s) =>
  s.links.map((l) => ({ label: l.label, href: l.href, section: s.title, icon: s.icon })),
);

export function ZonoCommandCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Open via Cmd/Ctrl+K + the sidebar button event; close via ESC.
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

  // Body scroll-lock + autofocus search while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => { document.body.style.overflow = prev; window.clearTimeout(id); setQuery(""); };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter((i) => `${i.label} ${i.section}`.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  const go = (href: string) => { setOpen(false); router.push(href); };

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
          className="fixed inset-0 z-[200] overflow-y-auto"
          style={{ background: "rgba(10,7,32,0.72)", backdropFilter: "blur(22px) saturate(140%)", WebkitBackdropFilter: "blur(22px) saturate(140%)" }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto flex min-h-full w-full max-w-[1240px] flex-col gap-8 px-5 py-10 sm:py-14"
          >
            {/* Close */}
            <button type="button" onClick={() => setOpen(false)} aria-label="סגור" className="absolute left-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/15">
              <Icon name="X" size={20} />
            </button>

            {/* Top — heading + global search */}
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="zono-ai-gradient grid h-12 w-12 place-items-center rounded-2xl text-white shadow-[0_12px_32px_rgba(124,58,237,0.5)]"><Icon name="Sparkles" size={24} /></span>
              <div>
                <h1 className="text-3xl font-black text-white sm:text-4xl">לאן תרצה לעבור?</h1>
                <p className="mt-1 text-sm font-medium text-white/60">כל המערכת במקום אחד</p>
              </div>
              <div className="relative w-full max-w-2xl">
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/40"><Icon name="Search" size={20} /></span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].href); }}
                  placeholder="חפש דף, נכס, לקוח, משימה או פעולה..."
                  className="h-14 w-full rounded-2xl border border-white/15 bg-white/8 pr-12 pl-4 text-base font-medium text-white placeholder:text-white/40 outline-none transition focus:border-brand-light focus:bg-white/12"
                />
                <kbd className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/50 sm:block">⌘K</kbd>
              </div>
            </div>

            {/* Search results take over when querying */}
            {query.trim() ? (
              <div className="mx-auto w-full max-w-2xl">
                {results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-white/50">לא נמצאו תוצאות עבור “{query}”.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {results.map((r) => (
                      <button key={`${r.href}-${r.label}`} type="button" onClick={() => go(r.href)} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-right transition hover:border-brand-light hover:bg-white/10">
                        <span className="bg-brand/30 grid h-9 w-9 place-items-center rounded-lg text-white"><Icon name={r.icon} size={16} /></span>
                        <span className="flex-1 text-sm font-bold text-white">{r.label}</span>
                        <span className="text-[11px] font-semibold text-white/40">{r.section}</span>
                        <Icon name="ChevronLeft" size={16} className="text-white/30" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Quick actions */}
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {QUICK_ACTIONS.map((a) => (
                    <Link key={a.label} href={a.href} onClick={() => setOpen(false)} className="zono-gradient inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(124,58,237,0.35)] transition hover:brightness-110">
                      <Icon name="Plus" size={15} /> {a.label}
                    </Link>
                  ))}
                </div>

                {/* Section cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {SECTIONS.map((s, i) => (
                    <motion.div
                      key={s.key}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.04 * i }}
                      className={cn(
                        "group flex flex-col gap-3 rounded-[24px] border p-5 transition-all",
                        s.highlight
                          ? "border-brand-light/50 bg-gradient-to-b from-brand/25 to-brand/5 hover:border-brand-light"
                          : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8",
                        "hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(124,58,237,0.25)]",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn("grid h-11 w-11 place-items-center rounded-2xl text-xl", s.highlight ? "zono-ai-gradient text-white" : "bg-white/10")}>{s.emoji}</span>
                        <div>
                          <p className="text-base font-black text-white">{s.title}</p>
                          <p className="text-[11px] font-medium text-white/50">{s.desc}</p>
                        </div>
                      </div>

                      {s.stats.length > 0 && (
                        <div className="flex flex-col gap-1 border-y border-white/10 py-2.5">
                          {s.stats.map((st) => (
                            <div key={st.label} className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-white/55">{st.label}</span>
                              <span className={cn("text-sm font-black tabular-nums", st.tone === "danger" ? "text-rose-300" : st.tone === "success" ? "text-emerald-300" : "text-brand-light")}>{st.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto flex flex-col gap-0.5">
                        {s.links.map((l) => (
                          <button key={l.label} type="button" onClick={() => go(l.href)} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right text-[13px] font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
                            {l.label}
                            <Icon name="ChevronLeft" size={14} className="text-white/30" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Bottom statement */}
                <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
                  <p className="text-xl font-black text-white sm:text-2xl">ZONO הוא מערכת ההפעלה של העסק שלך</p>
                  <p className="max-w-lg text-sm font-medium text-white/55">כל הנכסים, הלקוחות, העסקאות והבינה העסקית במקום אחד.</p>
                </div>
              </>
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
      className="zono-ai-gradient group mb-3 grid h-11 w-11 place-items-center rounded-2xl text-white shadow-[0_8px_22px_rgba(124,58,237,0.35)] transition-all hover:scale-[1.03] hover:shadow-[0_12px_30px_rgba(124,58,237,0.6)]"
    >
      <Icon name="Sparkles" size={20} strokeWidth={2.1} />
    </button>
  );
}
