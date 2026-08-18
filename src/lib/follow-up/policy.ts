// ============================================================================
// ZONO — Follow-up Engine: SLA / policy (pure, client-safe). Sane launch
// defaults that work with ZERO configuration. This is the single source of the
// operational thresholds the deterministic state model reads. An org-level
// override can later be layered in the server resolver (getFollowUpPolicy)
// without touching the model.
// ============================================================================

export interface FollowUpPolicy {
  /** New lead → target time to first response (minutes). */
  firstResponseMinutes: number;
  /** No meaningful contact for this many days on an active lead → "stale". */
  staleDays: number;
  /** Lead score at/above this is treated as hot / high-intent. */
  hotScore: number;
  /** After a meeting ends, a follow-up is due within this many hours. */
  postMeetingFollowUpHours: number;
  /** Escalation checkpoints (hours past the relevant deadline). */
  escalation: {
    /** Level 1 — gentle agent reminder. */
    agentHours: number;
    /** Level 2 — stronger agent reminder. */
    strongerHours: number;
    /** Level 3 — manager visibility (material delay). */
    managerHours: number;
  };
}

export const DEFAULT_FOLLOW_UP_POLICY: FollowUpPolicy = {
  firstResponseMinutes: 15,
  staleDays: 3,
  hotScore: 70,
  postMeetingFollowUpHours: 24,
  escalation: { agentHours: 4, strongerHours: 24, managerHours: 48 },
};
