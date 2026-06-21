"use client";

import { Spinner } from "./Button";
import type { ActionRunner } from "./useActionRunner";

/**
 * Consistent inline feedback for async actions: a live "what's happening" note
 * while running, a success/result note, and an error note. Drop one of these
 * right under a view's action bar and wire it to a useActionRunner instance.
 */
export function ActionFeedback({ runner, className }: { runner: ActionRunner; className?: string }) {
  const { pending, runningNote, note, error } = runner;
  if (!pending && !note && !error) return null;
  return (
    <div className={className}>
      {pending && runningNote && (
        <p className="bg-brand-soft text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Spinner size={15} />
          {runningNote}
        </p>
      )}
      {!pending && note && (
        <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{note}</p>
      )}
      {!pending && error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>
      )}
    </div>
  );
}
