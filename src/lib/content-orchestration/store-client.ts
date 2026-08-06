// ============================================================================
// ZONO — narrow DB client seam for the orchestration store. The Supabase
// specifics live in one small adapter (supabase-orchestration-store.ts); the
// store logic (org scope, idempotency, optimistic locking) is written against
// this interface so it is contract-tested against an in-memory fake and runs
// unchanged against Supabase.
// ============================================================================

export interface WhereEq { [column: string]: string | number | null }

export interface StoreClient {
  insert(table: string, row: Record<string, unknown>): Promise<void>;
  selectOne<T = Record<string, unknown>>(table: string, where: WhereEq): Promise<T | null>;
  selectMany<T = Record<string, unknown>>(table: string, where: WhereEq): Promise<T[]>;
  /** Update rows matching `where`; when `expectedVersion` is set it is added to the
   *  predicate and the affected-row count is returned (0 → optimistic-lock miss). */
  updateWhere(table: string, patch: Record<string, unknown>, where: WhereEq, expectedVersion?: number): Promise<number>;
}

export class OptimisticLockConflict extends Error {
  constructor(table: string, id: string) { super(`stale version on ${table}#${id}`); this.name = "OptimisticLockConflict"; }
}

/** Deterministic in-memory StoreClient used by contract tests. Enforces nothing
 *  Supabase-specific, but faithfully models insert/select/updateWhere + version. */
export class InMemoryStoreClient implements StoreClient {
  private t = new Map<string, Record<string, unknown>[]>();
  private rows(table: string) { let a = this.t.get(table); if (!a) { a = []; this.t.set(table, a); } return a; }
  private match(row: Record<string, unknown>, where: WhereEq) { return Object.entries(where).every(([k, v]) => row[k] === v); }

  async insert(table: string, row: Record<string, unknown>): Promise<void> { this.rows(table).push({ ...row }); }
  async selectOne<T>(table: string, where: WhereEq): Promise<T | null> {
    const r = this.rows(table).find((x) => this.match(x, where)); return (r ? ({ ...r } as T) : null);
  }
  async selectMany<T>(table: string, where: WhereEq): Promise<T[]> {
    return this.rows(table).filter((x) => this.match(x, where)).map((x) => ({ ...x } as T));
  }
  async updateWhere(table: string, patch: Record<string, unknown>, where: WhereEq, expectedVersion?: number): Promise<number> {
    const pred: WhereEq = expectedVersion === undefined ? where : { ...where, version: expectedVersion };
    let n = 0;
    for (const row of this.rows(table)) {
      if (this.match(row, pred)) {
        Object.assign(row, patch);
        if (expectedVersion !== undefined) row.version = expectedVersion + 1;
        n++;
      }
    }
    return n;
  }
}
