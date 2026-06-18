"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  createBuyerTaskAction,
  setBuyerTaskStatusAction,
} from "@/lib/buyers/actions";
import type { Database } from "@/lib/supabase/types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : null);
const isOverdue = (t: TaskRow) =>
  t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() < Date.now();

export function BuyerTasksPanel({
  buyerId,
  tasks,
}: {
  buyerId: string;
  tasks: TaskRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done");

  const add = () => {
    if (!title.trim()) return;
    setError(null);
    start(async () => {
      const r = await createBuyerTaskAction(buyerId, title, due || null);
      if (r?.error) setError(r.error);
      else {
        setTitle("");
        setDue("");
        router.refresh();
      }
    });
  };

  const toggle = (t: TaskRow) => {
    setError(null);
    start(async () => {
      const r = await setBuyerTaskStatusAction(
        buyerId,
        t.id,
        t.status === "done" ? "todo" : "done",
      );
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  };

  const renderTask = (t: TaskRow) => {
    const overdue = isOverdue(t);
    const d = fmtDate(t.due_at);
    return (
      <li
        key={t.id}
        className="border-line flex items-center gap-3 border-b py-2.5 last:border-0"
      >
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
          <p className={cn("text-sm font-semibold", t.status === "done" ? "text-muted line-through" : "text-ink")}>
            {t.title}
          </p>
          {d && (
            <p className={cn("text-[11px]", overdue ? "text-danger font-bold" : "text-muted")}>
              {overdue ? "באיחור · " : "יעד · "}
              {d}
            </p>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
        <input
          className={cn(field, "w-full")}
          placeholder="משימה חדשה (למשל: לשלוח 3 נכסים מתאימים)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" dir="ltr" className={field} value={due} onChange={(e) => setDue(e.target.value)} />
          <Button onClick={add} disabled={pending || !title.trim()} leadingIcon={<Icon name="Plus" size={16} />}>
            הוסף משימה
          </Button>
        </div>
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>
      )}

      <div>
        <p className="text-ink mb-2 text-sm font-extrabold">משימות פתוחות ({open.length})</p>
        {open.length === 0 ? (
          <p className="text-muted text-sm">אין משימות פתוחות.</p>
        ) : (
          <ul className="flex flex-col">{open.map(renderTask)}</ul>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <p className="text-muted mb-2 text-sm font-extrabold">הושלמו ({done.length})</p>
          <ul className="flex flex-col">{done.map(renderTask)}</ul>
        </div>
      )}
    </div>
  );
}
