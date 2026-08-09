"use client";
// Mobile-only sticky call/WhatsApp bar (spec §22). Hidden on desktop; appears
// after the hero so it never covers the first fold.
import { useEffect, useState } from "react";

export function MobileStickyCta({ whatsapp, tel }: { whatsapp: string | null; tel: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!whatsapp && !tel) return null;
  return (
    <div className={`fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-[var(--brand-border)] bg-[var(--brand-background)]/95 p-3 backdrop-blur transition-transform duration-200 lg:hidden ${show ? "translate-y-0" : "translate-y-full"}`}>
      {tel && <a href={tel} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] py-3 text-[14px] font-bold text-[var(--brand-text)]">התקשרו</a>}
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] py-3 text-[14px] font-bold text-[var(--brand-on-primary)]">WhatsApp</a>}
    </div>
  );
}
