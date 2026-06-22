import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { listStudioEntities, type StudioEntityRef } from "@/lib/creative-studio/service";
import { ENTITY_LABELS, ENTITY_ICONS } from "@/lib/creative-studio/engine";
import { StudioLauncher } from "./StudioLauncher";

export const dynamic = "force-dynamic";

export default async function CreativeStudioLauncherPage() {
  let entities: StudioEntityRef[] = [];
  try { entities = await listStudioEntities(); } catch (e) { console.error("[creative-studio] launcher failed:", e); }

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="Presentation" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">סטודיו שיווק נדל״ן</h1>
        </div>
        <p className="text-muted text-sm">כל החומרים, הסגנון וה-DNA השיווקי של הסוכן, הנכס או הפרויקט — במקום אחד.</p>
      </header>

      <StudioLauncher />

      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-sm font-black">סטודיואים פעילים</h2>
        {entities.length === 0 ? (
          <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">עדיין אין חומרים. פתח סטודיו לישות והעלה את החומר הראשון.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {entities.map((e) => (
              <Link key={`${e.entityType}:${e.entityId}`} href={`/creative-studio/${e.entityType}/${e.entityId}`} className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-4 shadow-sm hover:border-brand">
                <div className="flex items-center gap-2">
                  <span className="bg-surface text-muted grid h-8 w-8 place-items-center rounded-xl"><Icon name={ENTITY_ICONS[e.entityType] ?? "Sparkles"} size={15} /></span>
                  <div>
                    <p className="text-ink text-sm font-bold">{e.entityName}</p>
                    <p className="text-muted text-[11px]">{ENTITY_LABELS[e.entityType] ?? e.entityType}</p>
                  </div>
                </div>
                <span className="text-brand-strong text-sm font-black">{e.assetCount} חומרים</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
