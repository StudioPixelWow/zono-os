# Evolution worker (Personal WhatsApp Beta transport) — deployment

External infrastructure for ZONO's Personal WhatsApp (Beta) transport. Runs **separately** from the ZONO Next.js app (never on Vercel). Full procedures live in the **Evolution Operations Runbook**; this README is the quick deploy reference.

## What this is

A self-hosted, **official upstream**, **digest-pinned** Evolution API instance plus its **own** Postgres and Redis (isolated from ZONO's Supabase). ZONO reaches it only through the Personal transport adapter (`src/lib/whatsapp/provider/personal/`). Never forked, never patched (C7) — customization lives in ZONO's adapter.

## Deploy (staging first, then prod — separate configs/secrets)

1. Put secrets in the secret manager from `.env.example` (staging and prod get **different** values). Nothing secret is committed.
2. Resolve and pin the image digest: `docker buildx imagetools inspect evoapicloud/evolution-api:v2.3.7` → set `EVOLUTION_IMAGE=…@sha256:<digest>`.
3. `./scripts/preflight.sh` — refuses `:latest` or an undigested/placeholder image (enforces C7).
4. `docker compose up -d` — brings up Evolution + Postgres + Redis with `restart: always` and healthchecks (C5).
5. Front Evolution with a TLS reverse proxy; the container binds `127.0.0.1` only. No direct public/browser access.
6. On the ZONO side set `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `PERSONAL_WEBHOOK_TOKEN`, and keep `PERSONAL_WHATSAPP_ENABLED=false` until the pilot (C10).

## Capacity & graceful degradation

Budget **~50–100 active sessions per container**; scale horizontally past that (add worker nodes + a message broker for webhook fan-out) — see Runbook §7. An Evolution outage degrades **only** the Beta personal transport: the ZONO app, the Business Cloud path (Batch 6.6), CRM, AI and history keep working. The kill switch (`PERSONAL_WHATSAPP_ENABLED=false`) disables the transport instantly with no code deploy.

## Backup / restore

`scripts/backup.sh` (encrypt at rest, off-host) and `scripts/restore.sh` (restore drill on scratch infra). Worst-case personal-transport loss is session pairings, recoverable by QR re-scan — never conversations/CRM/AI, which live in ZONO. Full cadence and RTO/RPO in Runbook §3–4, §8.
