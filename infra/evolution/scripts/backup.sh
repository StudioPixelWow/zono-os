#!/usr/bin/env bash
# ============================================================================
# ZONO — Evolution BACKUP. Dumps the Evolution-owned Postgres (session metadata
# + encrypted session store). Output is SENSITIVE — encrypt at rest, store
# off-host. Containers are stateless and are NOT backed up. See the Operations
# Runbook for retention, verification and restore-drill cadence.
# Usage: BACKUP_DIR=/secure/backups ./backup.sh
# ============================================================================
set -euo pipefail

: "${PG_USER:?}"; : "${PG_DB:=evolution}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/evolution_${STAMP}.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "→ dumping Evolution Postgres ($PG_DB) → $OUT"
docker compose exec -T postgres pg_dump -U "$PG_USER" "$PG_DB" | gzip -9 > "$OUT"

# OPTIONAL (recommended): encrypt the dump with your secret-managed key.
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && command -v age >/dev/null 2>&1; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "${OUT}.age" "$OUT" && rm -f "$OUT"
  echo "✓ encrypted backup: ${OUT}.age"
else
  echo "✓ backup written: $OUT  (ENCRYPT THIS AT REST — it is sensitive)"
fi
