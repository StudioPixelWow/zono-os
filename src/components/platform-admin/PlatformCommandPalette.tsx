"use client";
// ============================================================================
// ZONO — Platform command palette (⌘K / Ctrl+K). P5.1. Fast quick-navigation
// across the platform nav plus a platform-wide organization search backed ONLY
// by the audited DAL (searchOrganizationsAction). NO destructive actions here in
// P5.1 — navigation + read-only org open only. Nav targets are gated by the
// operator's granted capabilities (defense-in-depth on top of per-route guards).
//
// This component is MOUNTED only while open (fresh mount = reset state), so it
// needs no reset effect; setState never runs synchronously inside an effect.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { PLATFORM_NAV_LEAVES } from "./nav-model";
import { PLAN_LABEL } from "./ui";
import { searchOrganizationsAction } from "@/lib/platform-admin/server/actions";
import type { PlatformOrgSummary } from "@/lib/platform-admin/server/dal";

export function PlatformCommandPalette({ onClose, caps }: { onClose: () => void; caps: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<PlatformOrgSummary[]>([]);
  const [resultQuery, setResultQuery] = useState("");
  const [active, setActive] = useState(0);
  const reqId = useRef(0);

  const q = query.trim();
  const canCustomers = caps.includes("platform.customers.read");
  const showOrgSection = canCustomers && q.length >= 2;

  const navItems = useMemo(() => PLATFORM_NAV_LEAVES.filter((l) => caps.includes(l.cap)), [caps]);
  const filteredNav = useMemo(() => {
    const s = q.toLowerCase();
    if (!s) return navItems;
    return navItems.filter((l) => l.label.toLowerCase().includes(s) || l.href.toLowerCase().includes(s));
  }, [navItems, q]);

  // Only surface org results that correspond to the CURRENT query text.
  const visibleOrgs = useMemo(
    () => (showOrgSection && resultQuery === q ? orgs : []),
    [showOrgSection, resultQuery, q, orgs],
  );
  const loading = showOrgSection && resultQuery !== q;

  const targets = useMemo(() => {
    const nav = filteredNav.map((l) => l.href);
    const org = visibleOrgs.map((o) => `/platform/customers/${o.id}`);
    return [...nav, ...org];
  }, [filteredNav, visibleOrgs]);

  // Debounced org search. setState happens ONLY inside the async timeout — never
  // synchronously in the effect body (satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!canCustomers || q.length < 2) return;
    let cancelled = false;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const res = await searchOrganizationsAction(q);
      if (cancelled || id !== reqId.current) return;
      setOrgs(res.ok ? res.orgs : []);
      setResultQuery(q);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, canCustomers]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(targets.length - 1, 0))); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); const href = targets[active]; if (href) go(href); }
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="חיפוש ופעולות">
      <button type="button" aria-label="סגור" className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="border-line bg-card relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl">
        <div className="border-line flex items-center gap-2 border-b px-4">
          <span className="text-muted"><Icon name="Search" size={18} /></span>
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="חפש ארגון או קפוץ למסך…"
            className="text-ink h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="border-line text-muted hidden rounded-md border px-1.5 py-0.5 text-[10px] font-bold sm:inline">ESC</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {filteredNav.length > 0 && (
            <div className="mb-1">
              <p className="text-muted px-2 py-1.5 text-[11px] font-bold">ניווט מהיר</p>
              {filteredNav.map((l, i) => (
                <button
                  key={l.href}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(l.href)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right", active === i ? "bg-brand-soft" : "hover:bg-surface")}
                >
                  <span className="text-brand"><Icon name={l.icon} size={16} /></span>
                  <span className="text-ink text-sm font-semibold">{l.label}</span>
                  {!l.ready ? <span className="bg-warning-soft text-warning ms-auto rounded px-1.5 py-0.5 text-[10px] font-bold">בקרוב</span> : null}
                </button>
              ))}
            </div>
          )}

          {showOrgSection && (
            <div>
              <p className="text-muted flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold">
                ארגונים
                {loading ? <Icon name="Loader" size={12} className="animate-spin" /> : null}
              </p>
              {visibleOrgs.map((o, i) => {
                const gi = filteredNav.length + i;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onMouseEnter={() => setActive(gi)}
                    onClick={() => go(`/platform/customers/${o.id}`)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right", active === gi ? "bg-brand-soft" : "hover:bg-surface")}
                  >
                    <span className="text-muted bg-surface grid h-7 w-7 place-items-center rounded-lg"><Icon name="Building2" size={14} /></span>
                    <span className="text-ink truncate text-sm font-semibold">{o.name}</span>
                    <span className="text-muted ms-auto text-[11px] font-bold">{o.plan ? (PLAN_LABEL[o.plan] ?? o.plan) : ""}</span>
                  </button>
                );
              })}
              {!loading && visibleOrgs.length === 0 ? <p className="text-muted px-3 py-3 text-center text-[13px]">לא נמצאו ארגונים</p> : null}
            </div>
          )}

          {filteredNav.length === 0 && !showOrgSection ? (
            <p className="text-muted px-3 py-6 text-center text-[13px]">הקלד לפחות 2 תווים לחיפוש ארגונים</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
