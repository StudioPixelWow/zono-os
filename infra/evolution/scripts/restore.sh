#!/usr/bin/env bash
# ============================================================================
# ZONO — Evolution RESTORE. Restores an Evolution Postgres dump into a fresh
# database. Start the SAME pinned image digest the backup was taken under before
# restoring. Some sessions may need QR re-pair afterward — that is expected and
# is NOT ZONO data loss (canonical conversations/CRM/AI live in ZONO). Run this
# on scratch infra on a schedule as the restore drill (Operations Runbook §4).
# Usage: ./restore.sh /secure/backups/evolution_<stamp>.sql.gz
# ============================================================================
set -euo pipefail

: "${PG_USER:?}"; : "${PG_DB:=evolution}"
SRC="${1:?usage: restore.sh <dump.sql.gz|.age>}"

TMP="$SRC"
if [[ "$SRC" == *.age ]]; then
  command -v age >/dev/null 2>&1 || { echo "✗ age not installed"; exit 1; }
  TMP="$(mktemp).sql.gz"
  age -d -o "$TMP" "$SRC"
fi

echo "→ restoring $SRC into Postgres ($PG_DB)"
gunzip -c "$TMP" | docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB"
echo "✓ restore complete — verify /instance/connectionState per session; re-pair (QR) any logged-out sessions."
