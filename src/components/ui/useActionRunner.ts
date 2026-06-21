"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface RunOptions<T> {
  /** Optional id so a specific row/button can show its own spinner. */
  id?: string;
  /** Message shown while the action runs (so the user knows what's happening). */
  pendingMessage?: string;
  /** Turn the action's return value into a human result message (or null for silent). */
  success?: (result: T) => string | null;
  /** Fallback success message if `success` isn't provided. */
  successMessage?: string;
  /** Refresh the route after the action (default true). */
  refresh?: boolean;
}

export interface ActionRunner {
  /** True while any action is running. */
  pending: boolean;
  /** Id of the currently-running keyed action (for per-row spinners). */
  busyId: string | null;
  /** Message describing the running action (set from pendingMessage). */
  runningNote: string | null;
  /** Success / result message after completion. */
  note: string | null;
  /** Error message after failure. */
  error: string | null;
  /** Run an async action with consistent pending + result + error feedback. */
  run: <T>(fn: () => Promise<T>, opts?: RunOptions<T>) => void;
  /** Clear note/error banners. */
  clear: () => void;
}

/**
 * Standardizes async-action UX across the app: a single hook that tracks the
 * pending state, surfaces a "what's happening" message while running, and ALWAYS
 * reports a result (success summary or error) so a button never looks stuck.
 */
export function useActionRunner(): ActionRunner {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningNote, setRunningNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setNote(null);
    setError(null);
  }, []);

  const run = useCallback(
    <T,>(fn: () => Promise<T>, opts: RunOptions<T> = {}) => {
      setNote(null);
      setError(null);
      setBusyId(opts.id ?? "__global__");
      setRunningNote(opts.pendingMessage ?? null);
      start(async () => {
        try {
          const result = await fn();
          const msg = opts.success ? opts.success(result) : (opts.successMessage ?? null);
          if (msg) setNote(msg);
          if (opts.refresh !== false) router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב.");
        } finally {
          setBusyId(null);
          setRunningNote(null);
        }
      });
    },
    [router],
  );

  return { pending, busyId, runningNote, note, error, run, clear };
}
