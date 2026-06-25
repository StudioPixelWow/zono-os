// ============================================================================
// ZONO Property Radar™ — cross-provider duplicate detection (pure).
// Same physical property listed on Yad2 AND Madlan should resolve to ONE market
// property while keeping BOTH provider references. Signals: phone, address,
// price+rooms, image overlap, title similarity. Detection only — no destructive
// merge here (the caller decides); we return groups + a confidence score.
// ============================================================================
import { normalizePhoneForWhatsapp } from "../utils";
import type { PropertyProviderName } from "../types";
import type {
  DuplicateGroup,
  DuplicateSignalHit,
  NormalizedListingDetails,
  NormalizedListingMetadata,
} from "./types";

type Listing = NormalizedListingMetadata | NormalizedListingDetails;

function normText(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function imagesOf(l: Listing): string[] {
  const det = l as NormalizedListingDetails;
  if (Array.isArray(det.images) && det.images.length) return det.images;
  return l.imageUrl ? [l.imageUrl] : [];
}

/** Jaccard token similarity 0..1. */
function titleSimilarity(a: string, b: string): number {
  const A = new Set(normText(a).split(" ").filter(Boolean));
  const B = new Set(normText(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function signalsBetween(a: Listing, b: Listing): { hit: DuplicateSignalHit; confidence: number } {
  const phoneA = normalizePhoneForWhatsapp(a.phone);
  const phoneB = normalizePhoneForWhatsapp(b.phone);
  const phone = !!phoneA && phoneA === phoneB;

  const addrA = normText(a.addressText ?? `${a.street ?? ""} ${a.neighborhood ?? ""} ${a.city ?? ""}`);
  const addrB = normText(b.addressText ?? `${b.street ?? ""} ${b.neighborhood ?? ""} ${b.city ?? ""}`);
  const address = addrA.length > 0 && addrA === addrB;

  const priceRooms =
    a.price != null && a.price === b.price && a.rooms != null && a.rooms === b.rooms;

  const imgsA = new Set(imagesOf(a).map((u) => u.toLowerCase()));
  const imagesHit = imagesOf(b).some((u) => imgsA.has(u.toLowerCase()));

  const title = titleSimilarity(a.title ?? "", b.title ?? "") >= 0.7;

  const hit: DuplicateSignalHit = { phone, address, priceRooms, images: imagesHit, title };
  // Weighted confidence — phone/images are strong; title alone is weak.
  const confidence =
    (phone ? 0.4 : 0) + (imagesHit ? 0.35 : 0) + (address ? 0.2 : 0) +
    (priceRooms ? 0.15 : 0) + (title ? 0.1 : 0);
  return { hit, confidence: Math.min(1, confidence) };
}

const DUPLICATE_THRESHOLD = 0.5;

/**
 * Group listings that refer to the same property across providers. A pair is a
 * duplicate when its weighted signal confidence ≥ 0.5. Groups span providers;
 * the canonical externalId is the lexicographically smallest (stable).
 */
export function detectCrossProviderDuplicates(listings: Listing[]): DuplicateGroup[] {
  const n = listings.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  const pairSignals = new Map<string, { hit: DuplicateSignalHit; confidence: number }>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = listings[i]!, b = listings[j]!;
      if (a.provider === b.provider) continue; // cross-provider only
      const s = signalsBetween(a, b);
      if (s.confidence >= DUPLICATE_THRESHOLD) {
        union(i, j);
        pairSignals.set(`${find(i)}`, s); // best-effort representative signals
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(i);
  }

  const out: DuplicateGroup[] = [];
  for (const [root, idxs] of groups) {
    if (idxs.length < 2) continue; // only real duplicate groups
    const members = idxs.map((i) => ({ provider: listings[i]!.provider, externalId: listings[i]!.externalId }));
    const providers = [...new Set(members.map((m) => m.provider))] as PropertyProviderName[];
    const canonicalExternalId = members.map((m) => m.externalId).sort()[0]!;
    const s = pairSignals.get(`${root}`) ?? { hit: { phone: false, address: false, priceRooms: false, images: false, title: false }, confidence: DUPLICATE_THRESHOLD };
    out.push({ canonicalExternalId, members, providers, signals: s.hit, confidence: s.confidence });
  }
  return out;
}
