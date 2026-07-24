// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DURABLE LEASE GUARDS (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// A claimed job is protected by a DURABLE database lease (owner + opaque token +
// expiry), never an in-memory timer. These pure guards define the fencing rules
// the store enforces atomically: a worker may heartbeat or complete a job ONLY by
// presenting the exact lease token + owner it was granted, and only while the
// lease has not expired. If a lease goes stale (worker died / paused past
// expiry), the reaper may reclaim the row and issue a NEW token — the zombie
// worker's stale token then fails every guard, so it can never resurrect or
// double-complete the job. The lease token is a server-only nonce; it is never
// surfaced in a DTO, audit record, log line, or UI.
// ============================================================================
import type { JobStatus } from "./job-state";

/** Bounded lease duration + heartbeat cadence. No unbounded env value feeds these. */
export const DEFAULT_LEASE_MS = 120_000;      // a claim is valid for 2 minutes…
export const DEFAULT_HEARTBEAT_MS = 30_000;   // …refreshed every 30s while working
export const MAX_LEASE_MS = 600_000;          // absolute ceiling on any lease

export interface LeaseState {
  status: JobStatus;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
}

export interface LeaseGrant {
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAtMs: number;
  claimedAtMs: number;
  heartbeatAtMs: number;
}

const boundLease = (ms: number) => Math.min(MAX_LEASE_MS, Math.max(1_000, Math.floor(ms)));

/** Build the lease fields for a fresh claim (owner + token supplied by ports). */
export function grantLease(owner: string, token: string, nowMs: number, durationMs = DEFAULT_LEASE_MS): LeaseGrant {
  const expiry = nowMs + boundLease(durationMs);
  return { leaseOwner: owner, leaseToken: token, leaseExpiresAtMs: expiry, claimedAtMs: nowMs, heartbeatAtMs: nowMs };
}

/** A lease is ACTIVE when a working job holds an unexpired token. */
export function isLeaseActive(lease: LeaseState, nowMs: number): boolean {
  return (lease.status === "claimed" || lease.status === "executing")
    && !!lease.leaseToken && lease.leaseExpiresAtMs != null && lease.leaseExpiresAtMs > nowMs;
}

/** A lease is STALE when a working job's lease has expired (or was never set). */
export function isLeaseStale(lease: LeaseState, nowMs: number): boolean {
  return (lease.status === "claimed" || lease.status === "executing")
    && (lease.leaseExpiresAtMs == null || lease.leaseExpiresAtMs <= nowMs);
}

/** Does a presented (owner, token) pair match the live lease? (Fencing check.) */
export function ownsLease(lease: LeaseState, owner: string, token: string): boolean {
  return !!lease.leaseToken && lease.leaseToken === token && lease.leaseOwner === owner;
}

export interface HeartbeatResult { ok: boolean; leaseExpiresAtMs: number | null; heartbeatAtMs: number | null; reason: string | null }

/**
 * A heartbeat is accepted only from the lease holder, only while working, and
 * only before expiry — a worker that already lost its lease cannot extend it.
 */
export function heartbeatLease(lease: LeaseState, owner: string, token: string, nowMs: number, durationMs = DEFAULT_LEASE_MS): HeartbeatResult {
  if (lease.status !== "claimed" && lease.status !== "executing") return { ok: false, leaseExpiresAtMs: lease.leaseExpiresAtMs, heartbeatAtMs: null, reason: "not_working" };
  if (!ownsLease(lease, owner, token)) return { ok: false, leaseExpiresAtMs: lease.leaseExpiresAtMs, heartbeatAtMs: null, reason: "lease_mismatch" };
  if (lease.leaseExpiresAtMs != null && lease.leaseExpiresAtMs <= nowMs) return { ok: false, leaseExpiresAtMs: lease.leaseExpiresAtMs, heartbeatAtMs: null, reason: "lease_expired" };
  return { ok: true, leaseExpiresAtMs: nowMs + boundLease(durationMs), heartbeatAtMs: nowMs, reason: null };
}

/**
 * May the presenter finalize (succeed/fail/retry/dead-letter) this job? Only the
 * current lease holder, and only from a working status. A reaped-and-reassigned
 * job has a new token, so the zombie holder is rejected here.
 */
export function canFinalize(lease: LeaseState, owner: string, token: string): { ok: boolean; reason: string | null } {
  if (lease.status !== "claimed" && lease.status !== "executing") return { ok: false, reason: "not_working" };
  if (!ownsLease(lease, owner, token)) return { ok: false, reason: "lease_mismatch" };
  return { ok: true, reason: null };
}

/** Cleared lease fields (used when a job leaves a working status). */
export const RELEASED_LEASE = { leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null } as const;
