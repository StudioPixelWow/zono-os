import Link from "next/link";
import { cn } from "@/lib/utils";
import { INVENTORY_TABS, type InventoryTab } from "@/lib/properties/inventory";

export function InventoryTabs({ active }: { active: InventoryTab }) {
  return (
    <div className="border-line flex gap-1 overflow-x-auto border-b">
      {INVENTORY_TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "all" ? "/properties" : `/properties?inv=${t.id}`}
          className={cn(
            "relative whitespace-nowrap px-4 py-2.5 text-sm font-bold transition",
            active === t.id ? "text-brand-strong" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          {active === t.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
        </Link>
      ))}
    </div>
  );
}
