import Tesseract from "tesseract.js";
import type { ExtractionConfidence, SemanticFact } from "@crosscheck/core";
import { safeFetchBinary, type SafeFetchOptions } from "../dynamic-discovery/safeFetch.js";

const { createWorker } = Tesseract;

/** Tesseract's own page-level `confidence` is 0-100 -- mapped onto this
 * project's 3-value scale. Deliberately conservative thresholds: OCR of
 * a real marketing-site fee graphic is often stylized (custom fonts,
 * background imagery), so only a confidently clean read counts as HIGH. */
function confidenceFromOcrScore(score: number): ExtractionConfidence {
  if (score >= 80) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function cleanOcrText(rawText: string): string {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

export interface OcrResult {
  text: string;
  confidence: ExtractionConfidence;
}

export type ImageOcrResolver = (imageUrl: string) => Promise<OcrResult | null>;

/**
 * Creates a per-run, cached image->OCR resolver (§8-9 of the semantic
 * layer plan) -- same "one resolver instance per run, shared across every
 * target, own internal cache" pattern as `createLogoHashResolver`. Image
 * bytes are fetched through `safeFetchBinary` (the same SSRF-safe path
 * logo perceptual hashing already uses — DNS-pin-and-connect, redirect
 * re-validation, private/loopback/link-local IP blocking), never a raw
 * `fetch()`. The underlying Tesseract worker is created lazily (only if
 * an image actually needs OCR-ing this run) and MUST be released via the
 * returned `dispose()` once the run finishes — a Tesseract worker holds a
 * real OS thread + loaded WASM/language data, and this process (the API
 * server) lives across many runs, so leaving it running would leak
 * resources across runs.
 */
export function createImageFeeOcrResolver(safeFetchOptions: SafeFetchOptions = {}): { resolve: ImageOcrResolver; dispose: () => Promise<void> } {
  const cache = new Map<string, Promise<OcrResult | null>>();
  let workerPromise: Promise<Tesseract.Worker> | null = null;

  async function getWorker(): Promise<Tesseract.Worker> {
    if (!workerPromise) {
      // `errorHandler` is NOT optional in practice: tesseract.js's
      // internal message handler does `if (errorHandler) errorHandler(data)
      // else throw Error(data)` on a failed job (e.g. an unreadable/
      // corrupt image) -- that `throw` happens inside a message-port
      // event callback, so it becomes an uncaught exception that crashes
      // the whole Node process, entirely separate from (and in addition
      // to) the `recognize()` promise's own rejection this module's
      // `resolve()` already catches below. A real bad image on a real
      // site (confirmed live) took the whole run down before this was
      // added. The handler itself is a no-op -- the resulting rejected
      // `recognize()` promise is what actually surfaces the failure.
      workerPromise = createWorker("eng", undefined, { errorHandler: () => {} });
    }
    return workerPromise;
  }

  const resolve: ImageOcrResolver = (imageUrl: string) => {
    const cached = cache.get(imageUrl);
    if (cached) return cached;
    const pending = (async (): Promise<OcrResult | null> => {
      const fetched = await safeFetchBinary(imageUrl, safeFetchOptions);
      if (!fetched.success || !fetched.bytes) return null;
      try {
        const worker = await getWorker();
        const { data } = await worker.recognize(fetched.bytes);
        const text = cleanOcrText(data.text);
        if (!text) return null;
        return { text, confidence: confidenceFromOcrScore(data.confidence) };
      } catch {
        // A decode/recognition failure is "nothing readable", never a
        // thrown error that aborts the whole run over one bad image.
        return null;
      }
    })();
    cache.set(imageUrl, pending);
    return pending;
  };

  const dispose = async (): Promise<void> => {
    if (!workerPromise) return;
    const worker = await workerPromise;
    await worker.terminate();
  };

  return { resolve, dispose };
}

/**
 * Fills in real OCR text/confidence for every `sourceType: "image_ocr"`
 * FEES fact that hasn't been resolved yet (empty `value`) -- kept as a
 * separate async step from `extractSemanticFacts` (pure/sync), only ever
 * called when the caller has actually opted into `enableImageFeeOcr`.
 * Every non-FEES, non-image, or already-resolved fact passes through
 * unchanged. A fact whose image couldn't be fetched or produced no
 * readable text stays an explicit "image detected, nothing readable"
 * fact (empty value, LOW confidence) rather than being silently dropped
 * -- §9: never mark simply MISSING for an image-based fee.
 */
export async function resolveImageFeeFacts(facts: SemanticFact[], resolveOcr: ImageOcrResolver): Promise<SemanticFact[]> {
  return Promise.all(
    facts.map(async (fact): Promise<SemanticFact> => {
      if (fact.field !== "FEES" || fact.sourceType !== "image_ocr" || fact.value || !fact.imageUrl) return fact;
      const result = await resolveOcr(fact.imageUrl);
      if (!result) return fact;
      return { ...fact, value: result.text, confidence: result.confidence };
    }),
  );
}
