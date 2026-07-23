# Observability — Personal WhatsApp (Beta) transport (6.6A.1)

Detect problems **before users report them**. This stack adds visibility only — no architecture or behavior change. Three signal sources:

1. **ZONO-side transport metrics** — Prometheus scrapes `GET /api/whatsapp/personal/metrics` (bearer `METRICS_TOKEN`). Per-agent / session / QR / reconnect / outbound / inbound / failure-rate counters + operation-latency histograms, emitted by the adapter/outbound/webhook/actions via the in-house registry.
2. **Worker & datastore metrics** — cAdvisor (container CPU/RAM + Evolution session footprint), node-exporter (host), postgres-exporter, redis-exporter.
3. **Structured JSON logs + OTel-shaped spans** — every emit also logs a redacted JSON line (→ Loki/Datadog and log-based metrics); spans carry `trace_id/span_id/duration_ms/status` ready for an OTLP collector (point `OTEL_EXPORTER_OTLP_ENDPOINT` at one).

## Bring up

```
# 1) Evolution worker (see ../README.md) is already running.
# 2) Set METRICS_TOKEN on the ZONO app (falls back to PERSONAL_WEBHOOK_TOKEN).
# 3) Fill prometheus/prometheus.yml REPLACE_ZONO_HOST + mount the token file.
docker compose -f docker-compose.observability.yml up -d
# Grafana → http://127.0.0.1:3000  (dashboards auto-provisioned; Prometheus datasource preset)
```

## What ships

- `prometheus/prometheus.yml` — scrape jobs (ZONO metrics, cAdvisor, node, postgres, redis).
- `prometheus/rules.yml` — **SLO recording rules** (connect/outbound/inbound success ratios, p95 latency) + **alert definitions** (worker down, high failure rate, QR failures, reconnect storm, auth failures, SLO breach, latency).
- `grafana/dashboards/` — **Operations Overview** (sessions, pairing, reconnect, outbound/inbound, connect) and **Health & SLOs** (SLO stat tiles, latency, error/rejection breakdowns). The Health & SLOs board is the at-a-glance health dashboard.
- `grafana/provisioning/` — datasource + dashboard auto-load.
- `docker-compose.observability.yml` — Prometheus + Grafana + exporters.

## SLOs (targets)

Connect success ≥ **95%**, outbound delivery success ≥ **98%** (excluding policy rejections), inbound webhook processing ≥ **99%**, p95 operation latency < **5s**. Definitions + playbooks: see `zono-6.6A.1-observability-slo-playbooks.md`.

## Notes / limits

- ZONO counters are **per app instance**. Scrape a long-lived instance, or rely on the JSON logs → log-based metrics on serverless (documented in the main Operations Runbook alignment note).
- Everything binds `127.0.0.1`; expose Grafana/Prometheus only via an authenticated proxy.
- Per-agent cardinality is bounded by the Beta session cap; keep the cap enforced.
