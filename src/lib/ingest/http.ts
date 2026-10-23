/**
 * Polite HTTP client for ingestion: timeouts, bounded retries with exponential
 * backoff, Retry-After support for 429/503, and an identifying User-Agent.
 */
export const USER_AGENT =
  "AI-Economics-Ingest/1.0 (+https://github.com/opedoussaut/ai-economics)";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 60_000);
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 60_000)) : null;
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 30_000, retries = 3, headers = {}, fetchImpl = fetch, sleep = defaultSleep } =
    opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json, */*", ...headers },
        signal: ctrl.signal,
      });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new HttpError(`HTTP ${res.status} from ${url}`, res.status, url);
      if (!retryable || attempt === retries) throw lastErr;
      await sleep(retryAfterMs(res) ?? 500 * 2 ** attempt);
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status !== null && err.status < 500 && err.status !== 429)
        throw err;
      if (attempt === retries) break;
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new HttpError(`Request failed: ${url}`, null, url);
}

export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}
