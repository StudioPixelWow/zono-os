"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { createTaskAction } from "@/lib/tasks/actions";
import type { PersonProfile, PersonRole } from "@/lib/people/service";
import type { NoteDTO } from "@/lib/notes/service";

const ROLE_TONE: Record<PersonRole, string> = { buyer: "bg-brand-soft text-brand-strong", seller: "bg-success-soft text-success", lead: "bg-warning-soft text-warning" };

function waLink(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "972" + d.slice(1);
  else if (!d.startsWith("972")) d = "972" + d;
  return `https://wa.me/${d}`;
}

export function PersonWorkspace({ person, notes }: { person: PersonProfile; notes: NoteDTO[] }) {
  const r = useActionRunner();
  const router = useRouter();
  const [showTask, setShowTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const wa = waLink(person.phone);

  const addTask = () =>
    r.run(async () => {
      const res = await createTaskAction({ title: taskTitle, entity: { kind: person.primary.type, id: person.primary.id } });
      if (!res.ok) throw new Error(res.error ?? "יצירת המשימה נכשלה");
      setTaskTitle(""); setShowTask(false); router.refresh();
      return res;
    }, { id: "person-task", pendingMessage: "יוצר משימה...", success: () => "המשימה נוצרה ✓" });

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <Link href="/people" className="text-muted hover:text-ink text-[12px] font-bold">← כל האנשים</Link>

      {/* header */}
      <header className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-10 w-10 place-items-center rounded-xl text-lg font-black">{person.name.slice(0, 1)}</span>
          <div>
            <h1 className="text-ink text-2xl font-black">{person.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {person.roles.map((role) => <span key={`${role.type}-${role.id}`} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_TONE[role.type]}`}>{role.label}</span>)}
              {person.agentName && <span className="text-muted text-[12px]">· סוכן: {person.agentName}</span>}
            </div>
          </div>
        </div>
        <p className="text-muted text-[13px]">{person.phone ?? "—"}{person.email ? ` · ${person.email}` : ""}</p>

        <div className="flex flex-wrap gap-2">
          {person.phone && <a href={`tel:${person.phone}`} className="bg-surface text-ink border-line hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="Phone" size={14} />חייג</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="bg-surface text-ink border-line hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="MessageCircle" size={14} />וואטסאפ</a>}
          {person.email && <a href={`mailto:${person.email}`} className="bg-surface text-ink border-line hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="Send" size={14} />אימייל</a>}
          <Button size="sm" variant="secondary" onClick={() => setShowTask((s) => !s)}><Icon name="Plus" size={14} />משימה</Button>
        </div>
        {showTask && (
          <div className="flex items-center gap-2">
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="כותרת המשימה" className="bg-surface border-line text-ink h-9 flex-1 rounded-xl border px-3 text-sm outline-none" />
            <Button size="sm" loading={r.busyId === "person-task"} disabled={!taskTitle.trim()} onClick={addTask}>צור</Button>
          </div>
        )}
        <ActionFeedback runner={r} />
      </header>

      {/* roles */}
      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-base font-black">תפקידים ורשומות</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {person.roles.map((role) => (
            <Link key={`${role.type}-${role.id}`} href={`/${role.route}/${role.id}`}
              className="bg-card border-line hover:border-brand-light flex items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm transition">
              <div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_TONE[role.type]}`}>{role.label}</span>
                {role.created_at && <p className="text-muted mt-1 text-[11px]">נוצר {new Date(role.created_at).toLocaleDateString("he-IL")}</p>}
              </div>
              <span className="text-brand-strong text-[12px] font-bold">פתח ↗</span>
            </Link>
          ))}
        </div>
      </section>

      {/* timeline */}
      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-base font-black">ציר זמן</h2>
        {person.timeline.length === 0 ? (
          <div className="bg-surface text-muted rounded-2xl px-4 py-6 text-center text-sm">אין פעילות מתועדת</div>
        ) : (
          <ol className="border-line flex flex-col gap-2 border-r-2 pr-3">
            {person.timeline.map((t, i) => (
              <li key={i} className="text-[13px]">
                <span className="text-ink font-semibold">{t.title || t.event_type}</span>
                <span className="text-muted"> · {new Date(t.occurred_at).toLocaleString("he-IL")} · {t.role === "buyer" ? "קונה" : t.role === "seller" ? "מוכר" : "ליד"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* notes */}
      <NotesPanel entity={{ type: person.primary.type, id: person.primary.id }} notes={notes} title="הערות" />
    </main>
  );
}
