import { SectionShell } from "../SectionShell";

/** Loading placeholder for the Properties strip — matches the card grid shape. */
export function PropertiesSkeleton() {
  return (
    <SectionShell title="הזדמנויות נדל״ן חדשות עבורך" eyebrow="מותאם עבורך">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-line flex animate-pulse flex-col overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]"
          >
            <div className="bg-surface h-40 w-full" />
            <div className="flex flex-col gap-3 p-4">
              <div className="bg-surface h-4 w-2/3 rounded" />
              <div className="bg-surface h-3 w-1/2 rounded" />
              <div className="bg-surface mt-1 h-5 w-1/3 rounded" />
              <div className="bg-surface h-3 w-3/4 rounded" />
              <div className="bg-surface mt-2 h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
