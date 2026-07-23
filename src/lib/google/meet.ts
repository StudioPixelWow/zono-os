// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Google Meet helpers (pure).
//
// Meet links are created and read THROUGH Google Calendar's conferenceData —
// there is no separate Meet API call and no separate scope. These pure helpers:
//   · build a conferenceData.createRequest with a deterministic requestId so a
//     retried event create never spawns a second Meet link (never duplicate);
//   · extract an existing Meet link from a Google event (hangoutLink or a
//     conferenceData video entry point) — NEVER fabricated when absent.
// ============================================================================

/** conferenceData payload that asks Google to CREATE a Meet link. The requestId
 *  is the event's idempotency key, so replays reuse the same conference. */
export function meetCreateRequest(requestId: string): Record<string, unknown> {
  return {
    createRequest: {
      requestId,
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}

interface ConferenceData {
  entryPoints?: { entryPointType?: string; uri?: string }[];
}

/** Return the Meet link for an event, or null if it genuinely has none.
 *  Prefers the top-level hangoutLink; falls back to a video entry point. */
export function extractMeetLink(hangoutLink: string | null | undefined, conferenceData: ConferenceData | null | undefined): string | null {
  if (hangoutLink && hangoutLink.trim().length > 0) return hangoutLink;
  const video = conferenceData?.entryPoints?.find((e) => e.entryPointType === "video" && !!e.uri);
  return video?.uri ?? null;
}

/** Whether a Meet link should be created for an event: only when the caller
 *  asked AND the event does not already carry one (never duplicate). */
export function shouldCreateMeet(requested: boolean, existingLink: string | null): boolean {
  return requested === true && !existingLink;
}
