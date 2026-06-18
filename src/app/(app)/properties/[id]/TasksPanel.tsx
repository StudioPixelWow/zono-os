"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  createPropertyTaskAction,
  setTaskStatusAction,
} from "@/lib/tasks/actions";
import type { Database, TaskPriority } from "@/lib/supabase/types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  urgent: "דחופה",
};
const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "bg-surface text-muted",
  medium: "bg-brand-soft text-brand-strong",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-danger-soft text-danger",
};

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("he-IL") : null;

const isOverdue = (t: TaskRow) =>
  t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() < Date.now();

export function TasksPanel({
  propertyId,
  tasks,
}: {
  propertyId: string;
  tasks: TaskRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done");

  const add = () => {
    if (!title.trim()) return;
    setError(null);
    start(async () => {
      const r = await createPropertyTaskAction(
        propertyId,
        title,
        due || null,
        priority,
      );
      if (r?.error) setError(r.error);
      else {
        setTitle("");
        setDue("");
        setPriority("medium");
        router.refresh();
      }
    });
  };

  const toggle = (t: TaskRow) => {
    setError(null);
    start(async () => {
      const r = await setTaskStatusAction(
        propertyId,
        t.id,
        t.status === "done" ? "todo" : "done",
      );
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  };

  const TaskItem = ({ t }: { t: TaskRow }) => {
    const overdue = isOverdue(t);
    const d = fmtDate(t.due_at);
    return (
      <li className="border-line flex items-center gap-3 border-b py-2.5 last:border-0">
        <button
          type="button"
          onClick={() => toggle(t)}
          disabled={pending}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition",
            t.status === "done"
              ? "bg-success border-success text-white"
              : "border-line text-transparent hover:border-brand",
          )}
          aria-label="סמן כהושלם"
        >
          <Icon name="UserCheck" size={13} />
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              t.status === "done" ? "text-muted line-through" : "text-ink",
            )}
          >
            {t.title}
          </p>
          {d && (
            <p className={cn("text-[11px]", overdue ? "text-danger font-bold" : "text-muted")}>
              {overdue ? "באיחור · " : "יעד · "}
              {d}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
            PRIORITY_TONE[t.priority],
          )}
        >
          {PRIORITY_LABELS[t.priority]}
        </span>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Add task */}
      <div className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
        <input
          className={cn(field, "w-full")}
          placeholder="משימה חדשה (למשל: לתאם צילום מקצועי)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            dir="ltr"
            className={field}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <select
            className={field}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <Button
            onClick={add}
            disabled={pending || !title.trim()}
            leadingIcon={<Icon name="Plus" size={16} />}
          >
            הוסף משימה
          </Button>
        </div>
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* Open tasks */}
      <div>
        <p className="text-ink mb-2 text-sm font-extrabold">
          משימות פתוחות ({open.length})
        </p>
        {open.length === 0 ? (
          <p className="text-muted text-sm">אין משימות פתוחות.</p>
        ) : (
          <ul className="flex flex-col">
            {open.map((t) => (
              <TaskItem key={t.id} t={t} />
            ))}
          </ul>
        )}
      </div>

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <p className="text-muted mb-2 text-sm font-extrabold">
            הושלמו ({done.length})
          </p>
          <ul className="flex flex-col">
            {done.map((t) => (
              <TaskItem key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
