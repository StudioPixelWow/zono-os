// Polished "בקרוב" placeholder for platform nav destinations not yet built
// (P5.1). No fake data, no fake charts, no dead links — just an honest,
// on-brand statement of what the section will contain. Every placeholder route
// is still server-guarded by its capability before this renders.
import { Icon } from "@/components/dashboard/Icon";
import { PageHeader } from "./ui";

export function PlatformPlaceholder({ eyebrow, title, icon, description, willContain }: {
  eyebrow: string; title: string; icon: string; description: string; willContain: string[];
}) {
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} icon={icon} />
      <div className="border-line bg-card rounded-2xl border p-8">
        <div className="flex items-center gap-3">
          <span className="text-brand bg-brand-soft grid h-11 w-11 place-items-center rounded-xl"><Icon name={icon} size={22} /></span>
          <div>
            <span className="bg-warning-soft text-warning inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-black">בקרוב</span>
            <p className="text-ink mt-1 text-lg font-black">{title}</p>
          </div>
        </div>
        <p className="text-muted mt-4 max-w-2xl text-sm leading-relaxed">{description}</p>
        {willContain.length ? (
          <ul className="mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
            {willContain.map((item) => (
              <li key={item} className="border-line bg-surface flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold text-ink">
                <span className="text-brand-light"><Icon name="Check" size={14} /></span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
