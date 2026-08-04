#!/usr/bin/env bash
# ============================================================================
# ZONO — browser E2E for the deterministic Creative test runtime (/creative-lab).
# Boots the real Next.js app with ZONO_CREATIVE_TEST_RUNTIME=true (in-memory
# store + mock providers + local storage) and runs Playwright. NO Supabase, NO
# OpenAI, NO Docker. Refuses to run against any production reference.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# Guard: never run against production/staging env or real providers.
if [[ -n "${OPENAI_API_KEY:-}" || -n "${SUPABASE_PROJECT_REF:-}" || -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  echo "refusing: production/provider env present — test runtime must run clean" >&2
  exit 2
fi

export ZONO_CREATIVE_TEST_RUNTIME=true
export LAB_E2E_PORT="${LAB_E2E_PORT:-3123}"
# PW_CHROMIUM is honored only if the caller sets it (e.g. a sandbox with a
# preinstalled binary). On CI / a normal machine it stays unset and Playwright
# uses its own installed Chromium.

# Unset anything that would trip the runtime guard.
unset SUPABASE_DB_URL CREATIVE_PUBLISHING_PROVIDER || true

echo "[e2e] running Playwright against test-runtime app on :$LAB_E2E_PORT"
npx playwright test --config=playwright.creative-lab.config.ts "$@"
