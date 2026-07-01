// ============================================================================
// ⚙️ Research Jobs — checkpointed stage engine (server-only). 26.4.15.
// ----------------------------------------------------------------------------
// Runs a city research job stage-by-stage within an execution budget. Reuses the
// Brokerage Research Agent for the real work (AI seed, staged search, extract,
// verify, promote) and City Discovery for broker/listing matching. Every stage
// is checkpointed; when the budget is nearly spent the job is saved as "waiting"
// and the NEXT run resumes from the last checkpoint. Never throws to the UI.
// Does NOT change verification/matching rules — it only orchestrates them.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { selectProvider } from "@/lib/ai-reasoning/gateway";
import { activeSearchVendor } from "../broker-research/providers";
import { proposeSystem, proposeUser } from "../research-agent/prompts";
import { stageQueries, runQuery, type Hit } from "../research-agent/search";
import { extractNames } from "../research-agent/extractor";
import { mergeNames, type MergedName } from "../research-agent/dedupe";
import { verifyOffice, systemConfidenceFrom } from "../research-agent/verifier";
import { saveResearching, updateVerification, promoteOffice, loadExisting, type ExistingIndex } from "../research-agent/repository";
import { discoverBrokerageOfficesForCity } from "../city-discovery";
import { getCityBrokerageCensus } from "../brokerage-knowledge";
import {
  loadJob, patchJob, loadResearchingCandidates, JobsTableMissing,
} from "./repository";
import { JOB_STAGES, nextStage, stageProgress, type ResearchJob, type JobStage, type JobStageLog } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const RESERVE_MS = 3500;   // keep enough time to save a checkpoint before timeout
function mkLog(stage: JobStage, t0: number, items: number, error: string | null): JobStageLog {
  const finishedAt = new Date().toISOString();
  return { stage, startedAt: new Date(t0).toISOString(), finishedAt, durationMs: Date.now() - t0, itemsProcessed: items, error, nextStage: nextStage(stage) };
}

interface Ctx {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string; city: string; cityNorm: string;
  provider: ReturnType<typeof selectProvider>;
  vendor: ReturnType<typeof activeSearchVendor>;
  existing: ExistingIndex | null;
  nowIso: string;
}
async function ensureExisting(ctx: Ctx): Promise<ExistingIndex> {
  if (!ctx.existing) ctx.existing = await loadExisting(ctx.db, ctx.orgId, ctx.city);
  return ctx.existing;
}
const fullKey = (m: MergedName, cityNorm: string) => `${m.normalizedBrand}|${m.normalizedName}|${cityNorm}`;

async function saveNewCandidates(ctx: Ctx, job: ResearchJob, names: { raw: string }[], stage: JobStage): Promise<ResearchJob> {
  const ex = await ensureExisting(ctx);
  const merged = mergeNames(names, ctx.city);
  let found = job.candidatesFound, saved = job.candidatesSaved;
  found += merged.length;
  for (const m of merged) {
    const key = fullKey(m, ctx.cityNorm);
    if (ex.candidateKeys.has(key)) continue;
    const id = await saveResearching(ctx.db, ctx.city, m, stage === "PUBLIC_SEARCH" ? "independents" : "city_understanding", 55, ctx.nowIso);
    if (id !== null) { ex.candidateKeys.add(key); if (id) saved++; }
  }
  return patchJob(job, { counts: { candidatesFound: found, candidatesSaved: saved } });
}

/** Run one job as far as the budget allows, checkpointing every stage. */
export async function runResearchJob(jobId: string, executionBudgetMs = 20000): Promise<ResearchJob | null> {
  let job = await loadJob(jobId);
  if (!job) return null;
  if (["completed", "cancelled", "failed"].includes(job.status)) return job;

  const t0 = Date.now();
  const left = () => executionBudgetMs - (Date.now() - t0);
  const ctx: Ctx = {
    db: createServiceRoleClient(), orgId: job.organizationId ?? "", city: job.city, cityNorm: job.normalizedCity,
    provider: selectProvider(), vendor: activeSearchVendor(), existing: null, nowIso: new Date().toISOString(),
  };

  try {
    job = await patchJob(job, { status: "running", markStarted: true });

    for (const stage of JOB_STAGES) {
      if (job.checkpoints.stagesDone.includes(stage)) continue;
      if (left() < RESERVE_MS) return patchJob(job, { status: "waiting", currentStage: stage });

      const stageStart = Date.now();
      let partial = false, items = 0, error: string | null = null;
      try {
        const r = await runStage(stage, job, ctx, left);
        job = r.job; partial = r.partial; items = r.items;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        job = await patchJob(job, { appendError: { stage, message: error } });
      }

      if (partial) return patchJob(job, { status: "waiting", currentStage: stage, appendLog: mkLog(stage, stageStart, items, error) });

      const stagesDone = [...job.checkpoints.stagesDone, stage];
      job = await patchJob(job, {
        checkpoints: { ...job.checkpoints, stagesDone },
        currentStage: nextStage(stage) ?? stage, progressPercent: stageProgress(stagesDone),
        appendLog: mkLog(stage, stageStart, items, error),
      });
    }

    return patchJob(job, { status: "completed", markCompleted: true, progressPercent: 100 });
  } catch (e) {
    if (e instanceof JobsTableMissing) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return patchJob(job, { status: "waiting", appendError: { stage: job.currentStage, message: msg } });
  }
}

// ── Stage handlers — each returns the (possibly patched) job + partial flag ──
async function runStage(stage: JobStage, job: ResearchJob, ctx: Ctx, left: () => number): Promise<{ job: ResearchJob; partial: boolean; items: number }> {
  switch (stage) {
    case "INIT": { const ex = await ensureExisting(ctx); return { job, partial: false, items: ex.knownBefore }; }

    case "AI_SEED": {
      if (!ctx.provider) return { job, partial: false, items: 0 };
      let names: { raw: string }[] = [];
      try {
        const text = await Promise.race([
          ctx.provider.complete({ system: proposeSystem(), user: proposeUser(ctx.city) }),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), Math.min(18000, left() - RESERVE_MS))),
        ]);
        const arr = (JSON.parse(text) as { names?: unknown }).names;
        if (Array.isArray(arr)) names = arr.map((it) => ({ raw: s((it as Row).name).trim() })).filter((x) => x.raw);
      } catch { /* best-effort */ }
      const updated = await saveNewCandidates(ctx, job, names, "AI_SEED");
      return { job: updated, partial: false, items: names.length };
    }

    case "PUBLIC_SEARCH": {
      if (!ctx.vendor) return { job, partial: false, items: 0 };
      const plan = stageQueries(ctx.city, {});
      let idx = job.checkpoints.searchStageIndex ?? 0;
      let searches = job.searchesCompleted, processed = 0;
      while (idx < plan.length) {
        if (left() < RESERVE_MS) {
          job = await patchJob(job, { checkpoints: { ...job.checkpoints, searchStageIndex: idx }, counts: { searchesCompleted: searches } });
          return { job, partial: true, items: processed };
        }
        const { stage: st, queries } = plan[idx];
        const results = await Promise.all(queries.map((q) => runQuery(ctx.vendor!, st, q)));
        const hits: Hit[] = [];
        for (const r of results) { searches++; hits.push(...r.hits); }
        const names = (await extractNames(ctx.provider, ctx.city, st, hits)).map((d) => ({ raw: d.raw }));
        job = await saveNewCandidates(ctx, { ...job, searchesCompleted: searches }, names, "PUBLIC_SEARCH");
        processed += names.length; idx++;
        job = await patchJob(job, { checkpoints: { ...job.checkpoints, searchStageIndex: idx }, counts: { searchesCompleted: searches } });
      }
      return { job, partial: false, items: processed };
    }

    case "EXTRACT": return { job, partial: false, items: job.candidatesSaved }; // extraction happened during PUBLIC_SEARCH

    case "VERIFY": {
      const queue = await loadResearchingCandidates(ctx.city);
      const done = new Set(job.checkpoints.verifiedIds ?? []);
      let verified = job.candidatesVerified, researching = job.candidatesResearching, processed = 0;
      if (!ctx.vendor) {
        return { job: await patchJob(job, { counts: { candidatesWaitingForEvidence: queue.length } }), partial: false, items: 0 };
      }
      const ex = await ensureExisting(ctx);
      for (const cand of queue) {
        if (done.has(cand.id)) continue;
        if (left() < RESERVE_MS) {
          const waiting = queue.filter((q) => !done.has(q.id)).length;
          job = await patchJob(job, { checkpoints: { ...job.checkpoints, verifiedIds: [...done] }, counts: { candidatesVerified: verified, candidatesResearching: researching, candidatesWaitingForEvidence: waiting } });
          return { job, partial: true, items: processed };
        }
        const m: MergedName = { key: `${cand.normalizedBrand}|${cand.normalizedName}`, officeName: cand.officeName, normalizedName: cand.normalizedName, normalizedBrand: cand.normalizedBrand, brandNetwork: cand.brandNetwork, branch: null, aliases: [cand.officeName] };
        const v = await verifyOffice(ctx.vendor, cand.officeName, ctx.city, cand.normalizedBrand !== "independent", 2);
        const sysConf = systemConfidenceFrom(v);
        await updateVerification(ctx.db, cand.id, ctx.city, m, "cross_reference", 55, sysConf, v.proven, v);
        if (v.proven) { const oid = await promoteOffice(ctx.db, ex.officeByNorm, m, ctx.city, v.phone, sysConf, v, ctx.nowIso); if (oid) { verified++; ex.officeByNorm.set(cand.normalizedName, { id: oid } as never); } else researching++; }
        else researching++;
        done.add(cand.id); processed++;
        if (processed % 3 === 0) job = await patchJob(job, { checkpoints: { ...job.checkpoints, verifiedIds: [...done] }, counts: { candidatesVerified: verified, candidatesResearching: researching } });
      }
      const waiting = queue.filter((q) => !done.has(q.id)).length;
      job = await patchJob(job, { checkpoints: { ...job.checkpoints, verifiedIds: [...done] }, counts: { candidatesVerified: verified, candidatesResearching: researching, candidatesWaitingForEvidence: waiting } });
      return { job, partial: false, items: processed };
    }

    case "PROMOTE": return { job, partial: false, items: job.candidatesVerified }; // promotion folded into VERIFY

    case "MATCH_BROKERS": {
      const r = await discoverBrokerageOfficesForCity(ctx.orgId, ctx.city, { depth: "quick", includePublicResearch: false, includeBrokerRematch: true, includeListingRelink: false });
      return { job, partial: false, items: r.brokersMatched };
    }

    case "RELINK_LISTINGS": {
      const r = await discoverBrokerageOfficesForCity(ctx.orgId, ctx.city, { depth: "quick", includePublicResearch: false, includeBrokerRematch: false, includeListingRelink: true });
      return { job, partial: false, items: r.listingsLinked };
    }

    case "SUMMARY": {
      const census = await getCityBrokerageCensus(ctx.orgId, ctx.city).catch(() => null);
      const summary: Record<string, unknown> = census ? {
        verifiedOffices: census.verifiedOffices, researchingOffices: census.researchingOffices,
        brokersTotal: census.brokersTotal, brokersResearching: census.brokersResearching,
        listingsTotal: census.listingsTotal, listingsLinked: census.listingsLinked,
        aiCandidates: census.aiCandidates, knowledgeState: census.knowledgeState, marketCoveragePct: census.marketCoveragePct,
      } : { note: "census unavailable" };
      const updated = await patchJob(job, {
        resultSummary: summary,
        counts: census ? { candidatesResearching: census.missingKnowledge.unverifiedCandidates } : {},
      });
      return { job: updated, partial: false, items: 1 };
    }

    default: return { job, partial: false, items: 0 };
  }
}
