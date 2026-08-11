import { Jimp } from "jimp";
import { bmvbhash } from "blockhash-core";
import * as cheerio from "cheerio";
import { safeFetch, safeFetchBinary } from "../dynamic-discovery/safeFetch.js";
import type { SafeFetchOptions } from "../dynamic-discovery/safeFetch.js";

/** 16x16 blocks -> 256-bit hash, 64 hex characters. Matches the
 * granularity typical difference-hash implementations use for logo-scale
 * images (small, simple graphics) — enough discrimination between
 * genuinely different marks without being so fine-grained that ordinary
 * resize/re-compression artifacts register as a mismatch. */
const HASH_BITS = 16;

/**
 * Component: Sprint 4b lazy/cached logo perceptual hashing. Fetches
 * (SSRF-safe, via `safeFetchBinary`), decodes (`jimp`), and hashes
 * (`blockhash-core`'s block-mean-value hash) exactly one image. Never
 * called directly by gate/comparison logic — always through
 * `createLogoHashResolver`'s cache, so an identical image URL is fetched
 * and hashed at most once per run (Revision 3 §9's performance bound).
 */
export async function computeLogoHash(imageUrl: string, safeFetchOptions: SafeFetchOptions = {}): Promise<string | null> {
  const fetched = await safeFetchBinary(imageUrl, safeFetchOptions);
  if (!fetched.success || !fetched.bytes) return null;
  try {
    const image = await Jimp.fromBuffer(fetched.bytes);
    const { data, width, height } = image.bitmap;
    return bmvbhash({ data, width, height }, HASH_BITS);
  } catch {
    // Unsupported/corrupt image format -- an honest "couldn't determine",
    // never a crash and never silently treated as a hash of zero/empty.
    return null;
  }
}

function popcount4(nibble: number): number {
  let count = 0;
  let n = nibble;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

/** 0-1 similarity from two equal-length hex hash strings, via Hamming
 * distance over the underlying bits (not raw character equality, which
 * would under-count differences since each hex character packs 4 bits).
 * Mismatched lengths (shouldn't happen — both hashes come from the same
 * HASH_BITS constant — but never assume) return 0 (maximally dissimilar)
 * rather than throwing. */
export function hashSimilarity(hashA: string, hashB: string): number {
  if (hashA.length === 0 || hashA.length !== hashB.length) return 0;
  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    const a = Number.parseInt(hashA[i], 16);
    const b = Number.parseInt(hashB[i], 16);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    distance += popcount4(a ^ b);
  }
  return 1 - distance / (hashA.length * 4);
}

export type LogoHashResolver = (imageUrl: string) => Promise<string | null>;

/**
 * Per-run cache + in-flight-request dedup, keyed by resolved image URL —
 * the same pattern `createMasterClaimsResolver`
 * (`discoverAndCompareMany.ts`) already uses for claims. An identical
 * logo URL referenced by many candidates and/or targets is fetched and
 * hashed exactly once for the whole run, regardless of how many callers
 * request it concurrently.
 */
export function createLogoHashResolver(safeFetchOptions: SafeFetchOptions = {}): LogoHashResolver {
  const cache = new Map<string, Promise<string | null>>();
  return function resolveLogoHash(imageUrl: string): Promise<string | null> {
    let pending = cache.get(imageUrl);
    if (!pending) {
      pending = computeLogoHash(imageUrl, safeFetchOptions);
      cache.set(imageUrl, pending);
    }
    return pending;
  };
}

/**
 * Component: D1 follow-up — lightweight, structural/text-only SVG
 * identification. SVG rasterization (a new dependency — `resvg`/`sharp`/
 * similar) was evaluated and explicitly deferred; Jimp 1.6.1 (checked
 * directly against `node_modules`) has no SVG decoder at all. This fetches
 * an externally-referenced `.svg` asset's raw markup (SVG is XML text, not
 * a binary format `safeFetchBinary`/Jimp would be needed for) and reads
 * the same accessible-metadata text `detectLogoCandidates` already reads
 * for free from *inline* `<svg>` markup — `<title>`/`<desc>`/`aria-label`
 * on the root element. Never rasterizes/decodes pixels. Returns null
 * (never throws) on any fetch/parse failure or when the SVG carries no
 * such metadata — an unreadable/opaque SVG is inconclusive evidence, not a
 * conflict, matching every other logo-fetch failure mode in this module.
 */
export async function fetchSvgStructuralText(svgUrl: string, safeFetchOptions: SafeFetchOptions = {}): Promise<string | null> {
  const result = await safeFetch(svgUrl, { ...safeFetchOptions, requireHtml: false });
  if (!result.success || !result.html) return null;
  try {
    const $ = cheerio.load(result.html);
    const root = $("svg").first();
    const title = root.find("title").first().text().trim();
    const desc = root.find("desc").first().text().trim();
    const ariaLabel = root.attr("aria-label") ?? "";
    const text = [title, desc, ariaLabel].filter(Boolean).join(" ");
    return text || null;
  } catch {
    return null;
  }
}

export type SvgStructuralTextResolver = (svgUrl: string) => Promise<string | null>;

/** Same per-run cache + in-flight-dedup pattern as
 * `createLogoHashResolver` above (a second cache instance for a second
 * kind of evidence, not a second caching mechanism) — an identical `.svg`
 * URL referenced by many candidates/targets is fetched at most once per
 * run. */
export function createSvgStructuralTextResolver(safeFetchOptions: SafeFetchOptions = {}): SvgStructuralTextResolver {
  const cache = new Map<string, Promise<string | null>>();
  return function resolveSvgStructuralText(svgUrl: string): Promise<string | null> {
    let pending = cache.get(svgUrl);
    if (!pending) {
      pending = fetchSvgStructuralText(svgUrl, safeFetchOptions);
      cache.set(svgUrl, pending);
    }
    return pending;
  };
}
