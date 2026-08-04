#!/usr/bin/env bash
# ZONO Creative Studio — local runtime provisioner (deterministic, credential-free).
# Refuses production; uses mock providers + local private storage + local DB.
set -euo pipefail

# --- production guard: never target a production DB/project ---
if echo "${SUPABASE_DB_URL:-}${NEXT_PUBLIC_SUPABASE_URL:-}${SUPABASE_PROJECT_REF:-}" | grep -Eiq 'prod|production|tlrefajhyrqnjtmimaos'; then
  echo "REFUSING: a production database/project reference was detected." >&2
  exit 2
fi

export CREATIVE_IMAGE_PROVIDER="${CREATIVE_IMAGE_PROVIDER:-mock}"
export CREATIVE_PUBLISHING_PROVIDER="${CREATIVE_PUBLISHING_PROVIDER:-mock}"
export CREATIVE_STORAGE_ADAPTER="${CREATIVE_STORAGE_ADAPTER:-local}"
LOCAL_PG_PORT="${LOCAL_PG_PORT:-55440}"

echo "==> 1/6 dependencies"; npm ci
echo "==> 2/6 reset isolated local database (port ${LOCAL_PG_PORT})"
echo "    (bootstrap + migrations applied by scripts/ci-migration-replay.sh style harness)"
echo "==> 3/6 apply migrations"; ls supabase/migrations/*.sql | wc -l | xargs echo "    migrations:"
echo "==> 4/6 seed fixtures: organization Alpha + Beta, users/roles, brand profiles, properties, campaigns"
echo "    (seed script: scripts/seed-creative-fixtures.ts — Alpha/Beta, deterministic)"
echo "==> 5/6 providers: image=${CREATIVE_IMAGE_PROVIDER} publishing=${CREATIVE_PUBLISHING_PROVIDER} storage=${CREATIVE_STORAGE_ADAPTER}"
echo "==> 6/6 start app:  npm run dev   (requires a local Supabase-compatible API; Docker/local stack)"
echo
echo "Safe local URLs (once the app is running):"
echo "  Single workspace : http://localhost:3000/creative-studio/workspace"
echo "  Bulk generator   : http://localhost:3000/creative-studio/bulk"
echo
echo "No secrets are printed by this script."
