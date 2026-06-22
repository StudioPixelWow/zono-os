"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ENTITY_LABELS } from "@/lib/creative-studio/engine";
import type { SelectableEntity } from "@/lib/creative-studio/service";

/**
 * Open a ZONO Creative studio for any entity — by picking a real entity from a
 * dropdown (each option carries its UUID). Never asks for a raw id, so a name
 * can never reach a uuid query (#P2-5 / #P2-8).
 */
export function StudioLauncher({ entities }: { entities: Record<string, SelectableEntity[]> }) {
  const router = useRouter();
  const types = Object.keys(ENTITY_LABELS).filter((t) => (entities[t] ?? []).length > 0);
  const [entityType, setEntityType] = useState(types[0] ?? "agent");
  const [entityId, setEntityId] = useState("");
  const options = entities[entityType] ?? [];

  return (
    <div className="bg-card border-line flex flex-wrap items-end gap-2 rounded-2xl border p-4 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="text-muted text-[11px] font-bold">סוג ישות</span>
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setEntityId(""); }}
          className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm"
        >
          {(types.length ? types : Object.keys(ENTITY_LABELS)).map((k) => (
            <option key={k} value={k}>{ENTITY_LABELS[k] ?? k}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-muted text-[11px] font-bold">בחר {ENTITY_LABELS[entityType] ?? "ישות"}</span>
        <select
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="border-line bg-surface text-ink h-9 min-w-[200px] rounded-lg border px-2 text-sm"
        >
          <option value="">— בחר —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <Button size="sm" disabled={!entityId} onClick={() => router.push(`/creative-studio/${entityType}/${entityId}`)}>
        <Icon name="Presentation" size={14} />פתח קריאייטיב
      </Button>
    </div>
  );
}
