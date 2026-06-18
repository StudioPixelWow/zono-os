/**
 * Import Israeli localities into public.israel_localities.
 *
 * Reads the official CBS / Ministry of Interior localities file (Hebrew column
 * headers), maps every column, and upserts by `locality_code` — idempotent and
 * safe to re-run (no duplicates). Emits detailed logs at every stage so a zero
 * result is never silent.
 *
 * Run:
 *   npm run import:localities -- <path-to-file> [--dry-run] [--encoding=cp1255]
 *
 * Env (from .env.local or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (writes bypass RLS — server-only)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const TARGET_TABLE = "israel_localities"; // public schema (default)

// ── Official Hebrew headers → our schema ─────────────────────────────────────
const COL = {
  code: "סמל_ישוב",
  nameHe: "שם_ישוב",
  nameEn: "שם_ישוב_לועזי",
  subdistrictCode: "סמל_נפה",
  subdistrict: "שם_נפה",
  bureauCode: "סמל_לשכת_מנא",
  bureau: "לשכה",
  regionalCouncilCode: "סמל_מועצה_איזורית",
  regionalCouncil: "שם_מועצה",
} as const;

interface LocalityRecord {
  locality_code: string;
  name_he: string;
  name_en: string | null;
  subdistrict: string | null;
  is_active: boolean;
  metadata: Record<string, string>;
}

const log = (...a: unknown[]) => console.log("[localities]", ...a);

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function mask(v: string | undefined): string {
  if (!v) return "(missing)";
  return v.length <= 8 ? "(set)" : `${v.slice(0, 4)}…${v.slice(-4)} (len ${v.length})`;
}

function loadEnv() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    try {
      const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        if (m[1] === "NEXT_PUBLIC_SUPABASE_URL") url ??= m[2].trim();
        if (m[1] === "SUPABASE_SERVICE_ROLE_KEY") key ??= m[2].trim();
      }
    } catch {
      /* rely on process.env */
    }
  }
  return { url, key };
}

/** Decode the file, auto-detecting CP1255 vs UTF-8 by looking for a known header. */
function decode(buffer: Buffer, forced?: string): { text: string; encoding: string } {
  if (forced) return { text: iconv.decode(buffer, forced), encoding: forced };
  for (const enc of ["utf-8", "cp1255"]) {
    const text = iconv.decode(buffer, enc);
    if (text.includes(COL.code) || text.includes(COL.nameHe)) {
      return { text, encoding: enc };
    }
  }
  // Fallback: CP1255 (the known format of the official file).
  return { text: iconv.decode(buffer, "cp1255"), encoding: "cp1255 (fallback)" };
}

/** Parse + map the source file. Returns mapped records, skips (with reasons), raw sample. */
export function parseLocalities(
  filePath: string,
  forcedEncoding?: string,
): {
  records: LocalityRecord[];
  skipped: { reason: string; row: unknown }[];
  rawSample: unknown[];
  parsedCount: number;
  encoding: string;
} {
  const buffer = readFileSync(filePath);
  const { text, encoding } = decode(buffer, forcedEncoding);

  const rows: Record<string, string>[] = parse(text, {
    columns: (header: string[]) => header.map((h) => h.trim().replace(/^﻿/, "")),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    quote: false, // plain comma-delimited; names may contain a literal " (e.g. בסמ"ה)
  });

  const byCode = new Map<string, LocalityRecord>();
  const skipped: { reason: string; row: unknown }[] = [];

  for (const row of rows) {
    const code = clean(row[COL.code]);
    const nameHe = clean(row[COL.nameHe]);
    if (!code) {
      skipped.push({ reason: "missing locality_code", row });
      continue;
    }
    if (!nameHe) {
      skipped.push({ reason: "missing name_he", row });
      continue;
    }
    byCode.set(code, {
      locality_code: code,
      name_he: nameHe,
      name_en: clean(row[COL.nameEn]) || null,
      subdistrict: clean(row[COL.subdistrict]) || null,
      is_active: true,
      metadata: {
        subdistrict_code: clean(row[COL.subdistrictCode]),
        bureau_code: clean(row[COL.bureauCode]),
        bureau_name: clean(row[COL.bureau]),
        regional_council_code: clean(row[COL.regionalCouncilCode]),
        regional_council_name: clean(row[COL.regionalCouncil]),
        source: "cbs_localities_file",
      },
    });
  }

  return {
    records: [...byCode.values()],
    skipped,
    rawSample: rows.slice(0, 3),
    parsedCount: rows.length,
    encoding,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const forcedEncoding = args.find((a) => a.startsWith("--encoding="))?.split("=")[1];

  // 1) File path
  if (!fileArg) {
    console.error("Usage: npm run import:localities -- <file> [--dry-run] [--encoding=cp1255]");
    process.exit(1);
  }
  const filePath = resolve(fileArg);
  log("file path:", filePath);
  log("file exists:", existsSync(filePath));
  if (!existsSync(filePath)) {
    console.error("ERROR: file not found at the path above.");
    process.exit(1);
  }

  // 2) Parse + map
  const { records, skipped, rawSample, parsedCount, encoding } = parseLocalities(
    filePath,
    forcedEncoding,
  );
  log("decoded encoding:", encoding);
  log("rows parsed:", parsedCount);
  log("first 3 raw rows:", JSON.stringify(rawSample, null, 2));
  log("rows mapped (unique by code):", records.length);
  log("first 3 mapped rows:", JSON.stringify(records.slice(0, 3), null, 2));
  log("rows skipped:", skipped.length);
  for (const s of skipped.slice(0, 20)) log("  skipped —", s.reason, JSON.stringify(s.row));
  if (skipped.length > 20) log(`  …and ${skipped.length - 20} more skipped`);

  if (records.length === 0) {
    console.error("ERROR: 0 rows mapped — check the header names / encoding above.");
    process.exit(1);
  }

  if (dryRun) {
    log("DRY RUN — nothing written. Re-run without --dry-run to import.");
    return;
  }

  // 5) Supabase target
  const { url, key } = loadEnv();
  log("supabase url:", url ?? "(missing)");
  log("service role key:", mask(key));
  if (!url || !key) {
    console.error("ERROR: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  log("target table: public." + TARGET_TABLE);

  // count before
  const before = await supabase
    .from(TARGET_TABLE)
    .select("*", { count: "exact", head: true });
  if (before.error) {
    console.error("ERROR reading target table (does it exist? is the key a service-role key?):");
    console.error(JSON.stringify(before.error, null, 2));
    process.exit(1);
  }
  log("count before:", before.count);

  // 6) Upsert in batches
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from(TARGET_TABLE)
      .upsert(batch, { onConflict: "locality_code" });
    if (error) {
      console.error(`ERROR upserting batch ${i / BATCH + 1}:`);
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }
    upserted += batch.length;
    log(`upserted ${upserted}/${records.length}`);
  }

  // count after
  const after = await supabase
    .from(TARGET_TABLE)
    .select("*", { count: "exact", head: true });
  log("count after:", after.count);
  log(`DONE — sent ${upserted} rows; table now has ${after.count ?? "?"} rows.`);
}

main().catch((e) => {
  console.error("[localities] FATAL:", e);
  process.exit(1);
});
