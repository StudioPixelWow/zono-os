// ZONO Public Sites — one feature block ("why work with me/us"). Larger, meaningful
// icon in a brand-soft container (48px) via the shared PublicIcon — no tiny glyphs.
import { PublicIcon, type PublicIconName } from "./PublicIcon";

export function PublicFeatureCard({ icon, title, text }: { icon: PublicIconName; title: string; text: string }) {
  return (
    <div className="group">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand-primary)] ring-1 ring-[var(--brand-border)] transition group-hover:-translate-y-0.5">
        <PublicIcon name={icon} size="feature" />
      </div>
      <h3 className="text-[18px] font-black text-[var(--brand-text)]">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--brand-muted)]">{text}</p>
    </div>
  );
}
