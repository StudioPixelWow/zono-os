"use client";
// ============================================================================
// ZONO Realtime — core subscription hook. Subscribes ONE channel to a set of
// org-scoped tables; invokes `onSignal(payload)` on any change. Falls back to a
// conservative 30s poll when realtime isn't connected. Cleans up on unmount and
// re-subscribes only when orgId / channel changes (no duplicate subscriptions).
// Browser (anon) client only — never service-role.
// ============================================================================
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeTableSub } from "./types";

interface Options {
  channelName: string;
  pollMs?: number;
  /** Called when realtime is unavailable and the poll fires. */
  onPoll?: () => void;
}

export interface RealtimeSignal {
  table: string;
  eventType: string;
  row: Record<string, unknown> | null;
}

export function useZonoRealtime(
  orgId: string | null,
  subs: RealtimeTableSub[],
  onSignal: (signal: RealtimeSignal) => void,
  opts: Options,
) {
  // Keep the latest callbacks in refs WITHOUT touching them during render
  // (writing `ref.current` in the render body trips react-hooks/refs).
  const cbRef = useRef(onSignal);
  const pollRef = useRef(opts.onPoll);
  useEffect(() => {
    cbRef.current = onSignal;
    pollRef.current = opts.onPoll;
  });

  // Snapshot table identity so the effect only re-runs on org/channel change.
  const subKey = subs.map((s) => `${s.table}:${s.event ?? "*"}:${s.orgColumn}`).join("|");

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    let connected = false;
    const channel = supabase.channel(opts.channelName);
    for (const s of subs) {
      channel.on(
        // @ts-expect-error supabase realtime overloads are loose for postgres_changes
        "postgres_changes",
        { event: s.event ?? "*", schema: "public", table: s.table, filter: `${s.orgColumn}=eq.${orgId}` },
        (payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          cbRef.current({ table: s.table, eventType: payload.eventType ?? "*", row: payload.new ?? payload.old ?? null });
        },
      );
    }
    channel.subscribe((status) => { connected = status === "SUBSCRIBED"; });

    const pollMs = opts.pollMs ?? 30_000;
    const poll = setInterval(() => { if (!connected) pollRef.current?.(); }, pollMs);

    return () => { clearInterval(poll); void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, opts.channelName, subKey]);
}
