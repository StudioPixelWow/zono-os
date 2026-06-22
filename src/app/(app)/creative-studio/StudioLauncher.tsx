"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ENTITY_LABELS } from "@/lib/creative-studio/engine";

/** Open a studio for any entity by type + id (no hardcoded ids). */
export function StudioLauncher() {
  const router = useRouter();
  const [entityType, setEntityType] = useState("agent");
  const [entityId, setEntityId] = useState("");
  const valid = entityId.trim().length > 0;
  return (
    <div className="bg-card border-line flex flex-wrap items-end gap-2 rounded-2xl border p-4 shadow-sm">
      <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סוג ישות</span>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1"><span className="text-muted text-[11px] font-bold">מזהה ישות (UUID)</span>
        <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="entity id" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
      </label>
      <Button size="sm" disabled={!valid} onClick={() => router.push(`/creative-studio/${entityType}/${entityId.trim()}`)}>
        <Icon name="Presentation" size={14} />פתח סטודיו
      </Button>
    </div>
  );
}
