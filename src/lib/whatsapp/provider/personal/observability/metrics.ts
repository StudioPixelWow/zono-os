// ============================================================================
// 📊 ZONO — Personal transport METRICS registry (in-house, Prometheus text).
// ----------------------------------------------------------------------------
// A tiny, dependency-free metrics registry that emits the Prometheus text
// exposition format. Transport-GENERIC (names no provider/Evolution) so it can
// be emitted from the adapter, outbound, webhook and actions without leaking any
// transport detail. Adds visibility ONLY — no behavior/architecture change.
//
// Note: counters are per-process (per app instance). On the always-on worker
// host or a long-lived ZONO instance this is scraped directly; on serverless,
// prefer the structured JSON logs (logger.ts) → log-based metrics. Documented in
// the observability README.
// ============================================================================

type Labels = Record<string, string>;

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const labelKey = (l: Labels) => Object.keys(l).sort().map((k) => `${k}="${esc(l[k])}"`).join(",");
const withLabels = (name: string, l: Labels) => (Object.keys(l).length ? `${name}{${labelKey(l)}}` : name);

interface Metric { name: string; help: string; type: "counter" | "gauge" | "histogram"; render(): string[] }

class Counter implements Metric {
  type = "counter" as const;
  private values = new Map<string, { labels: Labels; v: number }>();
  constructor(public name: string, public help: string) {}
  inc(labels: Labels = {}, by = 1): void {
    const k = labelKey(labels);
    const cur = this.values.get(k) ?? { labels, v: 0 };
    cur.v += by; this.values.set(k, cur);
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) out.push(`${this.name} 0`);
    for (const { labels, v } of this.values.values()) out.push(`${withLabels(this.name, labels)} ${v}`);
    return out;
  }
}

class Gauge implements Metric {
  type = "gauge" as const;
  private values = new Map<string, { labels: Labels; v: number }>();
  constructor(public name: string, public help: string) {}
  set(v: number, labels: Labels = {}): void { this.values.set(labelKey(labels), { labels, v }); }
  inc(labels: Labels = {}, by = 1): void { const k = labelKey(labels); const c = this.values.get(k) ?? { labels, v: 0 }; c.v += by; this.values.set(k, c); }
  dec(labels: Labels = {}, by = 1): void { this.inc(labels, -by); }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const { labels, v } of this.values.values()) out.push(`${withLabels(this.name, labels)} ${v}`);
    return out;
  }
}

const DEFAULT_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

class Histogram implements Metric {
  type = "histogram" as const;
  private series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();
  constructor(public name: string, public help: string, private buckets = DEFAULT_BUCKETS) {}
  observe(seconds: number, labels: Labels = {}): void {
    const k = labelKey(labels);
    const s = this.series.get(k) ?? { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
    // counts[i] holds the CUMULATIVE number of observations ≤ buckets[i]
    // (Prometheus bucket semantics), so render emits them directly.
    for (let i = 0; i < this.buckets.length; i++) if (seconds <= this.buckets[i]) s.counts[i]++;
    s.sum += seconds; s.count++; this.series.set(k, s);
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const s of this.series.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        out.push(`${withLabels(this.name + "_bucket", { ...s.labels, le: String(this.buckets[i]) })} ${s.counts[i]}`);
      }
      out.push(`${withLabels(this.name + "_bucket", { ...s.labels, le: "+Inf" })} ${s.count}`);
      out.push(`${withLabels(this.name + "_sum", s.labels)} ${s.sum}`);
      out.push(`${withLabels(this.name + "_count", s.labels)} ${s.count}`);
    }
    return out;
  }
}

class Registry {
  private metrics: Metric[] = [];
  counter(name: string, help: string): Counter { const m = new Counter(name, help); this.metrics.push(m); return m; }
  gauge(name: string, help: string): Gauge { const m = new Gauge(name, help); this.metrics.push(m); return m; }
  histogram(name: string, help: string, buckets?: number[]): Histogram { const m = new Histogram(name, help, buckets); this.metrics.push(m); return m; }
  /** Render the registry in Prometheus text exposition format. Optional prefix
   *  filters let callers render only (include) or all-but (exclude) a family —
   *  e.g. the synthetic endpoint renders only "wa_personal_synthetic". */
  render(opts: { include?: string; exclude?: string } = {}): string {
    const chosen = this.metrics.filter((m) =>
      (opts.include ? m.name.startsWith(opts.include) : true) &&
      (opts.exclude ? !m.name.startsWith(opts.exclude) : true));
    return chosen.flatMap((m) => m.render()).join("\n") + "\n";
  }
}

export const registry = new Registry();
export type { Counter, Gauge, Histogram };
