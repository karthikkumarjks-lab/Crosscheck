import type { IngestionFailureReason, IngestionResult } from "@crosscheck/core";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;

function parseHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return url;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function failure(
  requestedUrl: string,
  finalUrl: string,
  fetchedAt: string,
  failureReason: IngestionFailureReason,
  httpStatus: number | null = null,
  contentType: string | null = null,
): IngestionResult {
  return {
    requestedUrl,
    finalUrl,
    httpStatus,
    contentType,
    fetchedAt,
    html: null,
    success: false,
    failureReason,
  };
}

/**
 * Component A — URL ingestion. Validates the URL, fetches it (following
 * redirects up to MAX_REDIRECTS), and classifies failures explicitly
 * rather than throwing, per docs/design/WEBSITE_QUALITY_DESIGN.md
 * section 1: fetched content is untrusted input, and a failed ingestion
 * is a reportable outcome, not a silent skip.
 */
export async function ingestUrl(requestedUrl: string): Promise<IngestionResult> {
  const fetchedAt = new Date().toISOString();

  const parsed = parseHttpUrl(requestedUrl);
  if (!parsed) {
    return failure(requestedUrl, requestedUrl, fetchedAt, "invalid_url");
  }

  let currentUrl = parsed.toString();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(currentUrl, FETCH_TIMEOUT_MS);
    } catch {
      return failure(requestedUrl, currentUrl, fetchedAt, "unreachable");
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");
    if (isRedirect && location) {
      if (redirectCount === MAX_REDIRECTS) {
        return failure(requestedUrl, currentUrl, fetchedAt, "too_many_redirects", response.status);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      return failure(requestedUrl, currentUrl, fetchedAt, "http_error", response.status);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.toLowerCase().includes("text/html")) {
      return failure(requestedUrl, currentUrl, fetchedAt, "non_html", response.status, contentType);
    }

    const html = await response.text();
    if (html.trim().length === 0) {
      return failure(requestedUrl, currentUrl, fetchedAt, "empty_body", response.status, contentType);
    }

    return {
      requestedUrl,
      finalUrl: currentUrl,
      httpStatus: response.status,
      contentType,
      fetchedAt,
      html,
      success: true,
    };
  }

  return failure(requestedUrl, currentUrl, fetchedAt, "too_many_redirects");
}
