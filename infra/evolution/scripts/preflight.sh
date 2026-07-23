#!/usr/bin/env bash
# ============================================================================
# ZONO — Evolution deploy PREFLIGHT. Enforces the image-pinning rule (C7):
# official upstream, digest-pinned, NEVER :latest. Refuses to deploy otherwise.
# ============================================================================
set -euo pipefail

IMG="${EVOLUTION_IMAGE:-}"
if [[ -z "$IMG" ]]; then echo "✗ EVOLUTION_IMAGE is unset"; exit 1; fi
if [[ "$IMG" == *:latest ]] || [[ "$IMG" != *"@sha256:"* ]]; then
  echo "✗ EVOLUTION_IMAGE must be a digest-pinned reference (…@sha256:…), never a floating tag."
  echo "  got: $IMG"
  exit 1
fi
if [[ "$IMG" == *REPLACE_WITH_VERIFIED_DIGEST* ]]; then
  echo "✗ EVOLUTION_IMAGE still contains the placeholder digest — pin the real one."
  exit 1
fi
case "$IMG" in
  evoapicloud/evolution-api:*|atendai/evolution-api:*) : ;;   # official upstream repos
  *) echo "✗ EVOLUTION_IMAGE is not an official upstream Evolution image: $IMG"; exit 1 ;;
esac
echo "✓ preflight ok — pinned official image: $IMG"
